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
    """対象URLからダイカットキーホルダー商品を取得する。

    jp-api.com の HTML 構造:
      <a class="lightbox" href="/images/xxx_b.png" title="商品名">
        <img src="/images/xxx_b.png" alt="商品名" />
      </a>
    商品名は title 属性に格納されており、ページは Shift-JIS エンコード。
    """
    resp = requests.get(target_url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    # Shift-JIS ページを正しくデコード
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")

    items: list[ScrapedItem] = []

    # a.lightbox の title 属性が商品名、href が画像 URL
    for a in soup.select("a.lightbox"):
        item_name = a.get("title", "").strip()
        if not item_name or KEYCHAIN_KEYWORD not in item_name:
            continue

        img_url = urllib.parse.urljoin(target_url, a.get("href", ""))
        motif = _guess_motif(item_name)
        items.append(ScrapedItem(item_name=item_name, image_url_original=img_url, motif=motif))

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

    bucket = _get_images_bucket()
    _get_s3().upload_fileobj(
        data,
        bucket,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    logger.info("Uploaded image to s3://%s/%s", bucket, s3_key)
    return s3_key
