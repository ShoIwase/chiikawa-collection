import io
import logging
import os
import re
import urllib.parse
from dataclasses import dataclass

import boto3
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

IMAGES_BUCKET: str = os.environ["IMAGES_BUCKET"]
_s3 = boto3.client("s3")

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
    """対象URLからダイカットキーホルダー商品を取得する。"""
    resp = requests.get(target_url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items: list[ScrapedItem] = []

    # 商品リンクを探索: href に商品IDが含まれるもの
    # jp-api.com の構造: 商品名がテキストノード、画像が img タグ
    for product in soup.select(".item, .product, article, [class*='item'], [class*='product']"):
        name_el = product.find(["h2", "h3", "h4", "p", "span"], string=re.compile(KEYCHAIN_KEYWORD))
        if name_el is None:
            # 子要素のテキストに含まれるか確認
            if KEYCHAIN_KEYWORD not in product.get_text():
                continue
            # テキスト全体から商品名を抽出
            text = product.get_text(separator=" ").strip()
            lines = [l.strip() for l in text.splitlines() if KEYCHAIN_KEYWORD in l]
            if not lines:
                continue
            item_name = lines[0]
        else:
            item_name = name_el.get_text(strip=True)

        img_el = product.find("img")
        if img_el is None:
            continue
        img_src = img_el.get("src") or img_el.get("data-src") or ""
        if not img_src:
            continue

        # 相対URLを絶対URLに変換
        img_url = urllib.parse.urljoin(target_url, img_src)

        # モチーフ: ちいかわ / ハチワレ / うさぎ などを名前から推測
        motif = _guess_motif(item_name)

        items.append(ScrapedItem(item_name=item_name, image_url_original=img_url, motif=motif))

    if not items:
        # フォールバック: ページ内でキーワードを含む全 <a> タグを検索
        for a in soup.find_all("a"):
            text = a.get_text(strip=True)
            if KEYCHAIN_KEYWORD not in text:
                continue
            img_el = a.find("img")
            img_src = (img_el.get("src") or img_el.get("data-src") or "") if img_el else ""
            img_url = urllib.parse.urljoin(target_url, img_src) if img_src else ""
            motif = _guess_motif(text)
            items.append(ScrapedItem(item_name=text, image_url_original=img_url, motif=motif))

    logger.info("Scraped %d keychain items", len(items))
    return items


def _guess_motif(name: str) -> str:
    for motif in ["ちいかわ", "ハチワレ", "うさぎ", "くりまんじゅう", "momonga", "モモンガ"]:
        if motif in name:
            return motif
    return "ちいかわ"


def download_image_to_s3(image_url: str, item_name: str) -> str:
    """
    元サイトの画像を S3 にダウンロードし、S3 パスを返す。
    返り値は CloudFront 経由で /images/<key> としてアクセスされる。
    """
    safe_name = re.sub(r"[^\w\-]", "_", item_name)[:100]
    ext = os.path.splitext(urllib.parse.urlparse(image_url).path)[1] or ".jpg"
    s3_key = f"images/{safe_name}{ext}"

    resp = requests.get(image_url, headers=_HEADERS, timeout=30, stream=True)
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", "image/jpeg")
    data = io.BytesIO(resp.content)

    _s3.upload_fileobj(
        data,
        IMAGES_BUCKET,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    logger.info("Uploaded image to s3://%s/%s", IMAGES_BUCKET, s3_key)
    return s3_key
