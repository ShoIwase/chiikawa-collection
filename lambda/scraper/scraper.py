import base64
import io
import json
import logging
import os
import re
import urllib.parse
from dataclasses import dataclass

import boto3
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

CHIIKAWA_CHARACTERS = ["ちいかわ", "ハチワレ", "うさぎ"]
_BEDROCK_MODEL_ID = "jp.anthropic.claude-haiku-4-5-20251001-v1:0"

def _get_images_bucket() -> str:
    return os.environ["IMAGES_BUCKET"]

def _get_s3():
    return boto3.client("s3")

KEYCHAIN_KEYWORD = "ダイカットキーホルダー"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; ChiikawaCollectionBot/1.0; "
        "+https://github.com/shoiwase/chiikawa-collection)"
    )
}


@dataclass
class ScrapedItem:
    item_name: str
    image_url_original: str
    motif: str  # 商品ページから取得できる場合のみ。なければ item_name から推測


def fetch_items(target_url: str) -> list[ScrapedItem]:
    """対象URLの全ページを巡回してダイカットキーホルダー商品を取得する。

    jp-api.com の HTML 構造:
      <a class="lightbox" href="/images/xxx_b.png" title="商品名">
        <img src="/images/xxx_b.png" alt="商品名" />
      </a>
    商品名は title 属性に格納されており、ページは Shift-JIS エンコード。
    ページネーション: .next_back a[href*="PGE"] の形式。
    """
    items: list[ScrapedItem] = []
    visited: set[str] = set()
    pages = _collect_pages(target_url)

    for page_url in pages:
        if page_url in visited:
            continue
        visited.add(page_url)

        resp = requests.get(page_url, headers=_HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = "shift_jis"
        soup = BeautifulSoup(resp.text, "html.parser")

        for a in soup.select("a.lightbox"):
            item_name = a.get("title", "").strip()
            if not item_name or KEYCHAIN_KEYWORD not in item_name:
                continue
            img_url = urllib.parse.urljoin(page_url, a.get("href", ""))
            motif = _guess_motif(item_name)
            items.append(ScrapedItem(item_name=item_name, image_url_original=img_url, motif=motif))

        logger.info("Page %s: %d items (cumulative %d)", page_url, len(items), len(items))

    logger.info("Scraped %d keychain items across %d pages", len(items), len(visited))
    return items


def _collect_pages(top_url: str) -> list[str]:
    """トップページのページネーションリンクから全ページ URL を収集する。"""
    resp = requests.get(top_url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")

    pages = [top_url]
    seen = {top_url}
    for a in soup.select(".next_back a[href]"):
        href = a.get("href", "")
        if not href or "PGE" not in href:
            continue
        full = urllib.parse.urljoin(top_url, href)
        if full not in seen:
            seen.add(full)
            pages.append(full)

    return pages


def _guess_motif(name: str) -> str:
    if "ちいかわ" in name:
        return "ちいかわ"
    if "ハチワレ" in name:
        return "ハチワレ"
    if "うさぎ" in name:
        return "うさぎ"
    if "くりまんじゅう" in name:
        return "くりまんじゅう"
    if "モモンガ" in name or "momonga" in name.lower():
        return "モモンガ"
    return "ちいかわ"


def fetch_image_from_url(image_url: str) -> tuple[bytes, str]:
    """元サイトから画像をダウンロードし (バイト列, Content-Type) を返す。"""
    resp = requests.get(image_url, headers=_HEADERS, timeout=30, stream=True)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg")
    return resp.content, content_type


def upload_image_to_s3(image_data: bytes, item_name: str, content_type: str) -> str:
    """画像バイト列を S3 にアップロードし、S3 キー (images/xxx.jpg) を返す。"""
    safe_name = re.sub(r"[^\w\-]", "_", item_name)[:100]
    # Content-Type から拡張子を推定
    ct_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    ext = ct_ext.get(content_type.split(";")[0].strip(), ".jpg")
    s3_key = f"images/{safe_name}{ext}"

    bucket = _get_images_bucket()
    _get_s3().upload_fileobj(
        io.BytesIO(image_data),
        bucket,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    logger.info("Uploaded image to s3://%s/%s", bucket, s3_key)
    return s3_key


def download_image_to_s3(image_url: str, item_name: str) -> str:
    """後方互換ラッパー。fetch + upload をまとめて実行する。"""
    data, content_type = fetch_image_from_url(image_url)
    return upload_image_to_s3(data, item_name, content_type)


# 商品画像はちいかわ(左)/ハチワレ(中)/うさぎ(右)の3キャラが横並び。
# 各キャラのチャーム（柄）の中心は等分(0.167/0.5/0.833)ではなく中央寄りに位置する
# （実測: 0.20 / 0.50 / 0.79 W）。柄を中心にした正方形で切り出す。
_CHAR_X_CENTER = {"ちいかわ": 0.20, "ハチワレ": 0.50, "うさぎ": 0.79}
_CROP_Y_CENTER = 0.55   # 柄の縦中心（鎖を上に、キャプションを下に外す）
_CROP_SIDE_RATIO = 0.40  # 正方形の一辺（画像幅に対する比）


def crop_character(image_data: bytes, content_type: str, character: str) -> bytes:
    """3キャラ横並び画像から、指定キャラの柄を中心にした正方形を切り出して返す。

    一覧でどのキャラのエントリか一目で分かるようにするための加工。
    正方形なのでカードの正方形サムネに柄がきれいに収まる。
    対象外キャラや失敗時は元画像をそのまま返す（フォールバック）。
    """
    cx_ratio = _CHAR_X_CENTER.get(character)
    if cx_ratio is None:
        return image_data
    try:
        import io
        from PIL import Image

        im = Image.open(io.BytesIO(image_data))
        width, height = im.size
        side = min(int(width * _CROP_SIDE_RATIO), height)
        cx = int(width * cx_ratio)
        cy = int(height * _CROP_Y_CENTER)
        left = max(0, min(width - side, cx - side // 2))
        top = max(0, min(height - side, cy - side // 2))
        crop = im.crop((left, top, left + side, top + side))

        fmt = im.format
        if not fmt:
            fmt = "PNG" if "png" in content_type.lower() else "JPEG"
        out = io.BytesIO()
        crop.save(out, format=fmt)
        return out.getvalue()
    except Exception as e:  # noqa: BLE001 - 失敗時は元画像にフォールバック
        logger.warning("crop_character failed for %s: %s", character, e)
        return image_data


def _clean_region(region: str) -> str:
    """画像から抽出した地域ラベルを正規化する（『静岡限定』→『静岡』）。"""
    region = str(region).strip()
    region = re.sub(r"(店舗限定|限定)$", "", region).strip()
    return region


_AREA_TYPES = ("都道府県", "市区町村", "その他")


def analyze_image(image_data: bytes, content_type: str = "image/jpeg") -> dict:
    """Bedrock Claude (Converse API) で画像を解析し、キャラクター・地域名・エリア種別を返す。

    戻り値: {"characters": [...], "region": "静岡", "areaType": "都道府県", "prefecture": "静岡県"}
      - characters: ちいかわ / ハチワレ / うさぎ のうち画像に含まれるもの
      - region: 画像内の『○○限定』等の地域名（『限定』除去済み。無ければ ""）
      - areaType: 都道府県 / 市区町村 / その他 のいずれか（判定不能なら ""）
      - prefecture: regionが属する都道府県の正式名（例: 静岡県, 千葉県）。海外・広域・不明なら ""
    失敗時は {"characters": [], "region": "", "areaType": "", "prefecture": ""} を返す
    （呼び出し元でフォールバックすること）。
    """
    bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

    prompt = (
        "この画像はちいかわのご当地ダイカットキーホルダー商品です。"
        "次の4点をJSONオブジェクトのみで返してください。\n"
        "1. characters: 「ちいかわ」「ハチワレ」「うさぎ」のうち画像に含まれるもの（配列）\n"
        "2. region: 画像内に書かれた『○○限定』等の地域名。地名部分のみ（例: 静岡, 香港, 奈良, 鎌倉, 市川市）。"
        "地域表記が無ければ空文字。\n"
        "3. areaType: regionの種別。「都道府県」(47都道府県)/「市区町村」(鎌倉・箱根・横浜など市区町村)/"
        "「その他」(香港など海外、関西・東海・山陰などの広域、リゾート、不明) のいずれか。\n"
        "4. prefecture: regionが属する都道府県の正式名（例: 市川市→千葉県、鎌倉→神奈川県、静岡→静岡県）。"
        "海外・広域・不明なら空文字。\n"
        '例: {"characters": ["ちいかわ"], "region": "市川市", "areaType": "市区町村", "prefecture": "千葉県"}'
    )
    response = bedrock.converse(
        modelId=_BEDROCK_MODEL_ID,
        messages=[{
            "role": "user",
            "content": [
                {
                    "image": {
                        "format": content_type.split(";")[0].strip().split("/")[-1],
                        "source": {
                            "bytes": image_data,
                        },
                    },
                },
                {"text": prompt},
            ],
        }],
        inferenceConfig={"maxTokens": 200},
    )
    text = response["output"]["message"]["content"][0]["text"].strip()

    # モデルは ```json ... ``` のコードフェンスで包むことがあるため、
    # 最初の JSON オブジェクト {...} のみを抽出してからパースする。
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)

    try:
        data = json.loads(text)
        valid = set(CHIIKAWA_CHARACTERS)
        characters = [c for c in data.get("characters", []) if c in valid]
        region = _clean_region(data.get("region", ""))
        area_type = data.get("areaType", "")
        if area_type not in _AREA_TYPES:
            area_type = ""
        prefecture = str(data.get("prefecture", "") or "").strip()
        return {
            "characters": characters,
            "region": region,
            "areaType": area_type,
            "prefecture": prefecture,
        }
    except (json.JSONDecodeError, TypeError, KeyError, AttributeError):
        logger.warning("analyze_image: failed to parse response: %s", text)
        return {"characters": [], "region": "", "areaType": "", "prefecture": ""}
