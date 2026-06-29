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


def detect_characters(image_data: bytes, content_type: str = "image/jpeg") -> list[str]:
    """Bedrock Claude (Converse API) で画像を解析し、含まれるちいかわキャラクターのリストを返す。

    検出対象: ちいかわ / ハチワレ / うさぎ
    失敗時は空リストを返す（呼び出し元でフォールバックすること）。
    """
    bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

    prompt = (
        "この画像はちいかわのダイカットキーホルダー商品です。"
        "「ちいかわ」「ハチワレ」「うさぎ」のうち、画像に含まれているキャラクターを"
        "JSON配列のみで返してください。例: [\"ちいかわ\", \"ハチワレ\"]"
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
        inferenceConfig={"maxTokens": 60},
    )
    text = response["output"]["message"]["content"][0]["text"].strip()

    try:
        detected = json.loads(text)
        valid = set(CHIIKAWA_CHARACTERS)
        return [c for c in detected if c in valid]
    except (json.JSONDecodeError, TypeError, KeyError):
        logger.warning("detect_characters: failed to parse response: %s", text)
        return []
