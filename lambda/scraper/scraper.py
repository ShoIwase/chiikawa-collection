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
