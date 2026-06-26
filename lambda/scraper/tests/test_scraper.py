import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import pytest
import responses as resp_mock
import boto3
from unittest.mock import patch, MagicMock
from moto import mock_aws

from scraper import fetch_items, download_image_to_s3, _guess_motif

IMAGES_BUCKET = "chiikawa-images-123456789012"
TARGET_URL    = "https://www.jp-api.com/contents/NOD62/"

# ---------------------------------------------------------------------------
# fetch_items
# ---------------------------------------------------------------------------

SAMPLE_HTML = """
<html><body>
  <div class="item">
    <a href="/item/1">
      <h3>北海道 ダイカットキーホルダー</h3>
      <img src="/images/hokkaido.jpg" />
    </a>
  </div>
  <div class="item">
    <a href="/item/2">
      <h3>東京 缶バッジ</h3>
      <img src="/images/tokyo_badge.jpg" />
    </a>
  </div>
  <div class="item">
    <a href="/item/3">
      <h3>箱根 ダイカットキーホルダー ハチワレver</h3>
      <img src="/images/hakone.jpg" />
    </a>
  </div>
</body></html>
"""


class TestFetchItems:

    @resp_mock.activate
    def test_filters_keychain_items_only(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body=SAMPLE_HTML, status=200)

        items = fetch_items(TARGET_URL)

        names = [i.item_name for i in items]
        assert any("ダイカットキーホルダー" in n for n in names)
        assert all("缶バッジ" not in n for n in names)

    @resp_mock.activate
    def test_returns_two_keychain_items(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body=SAMPLE_HTML, status=200)

        items = fetch_items(TARGET_URL)
        assert len(items) == 2

    @resp_mock.activate
    def test_image_url_is_absolute(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body=SAMPLE_HTML, status=200)

        items = fetch_items(TARGET_URL)
        for item in items:
            if item.image_url_original:
                assert item.image_url_original.startswith("http")

    @resp_mock.activate
    def test_empty_page_returns_empty_list(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body="<html><body></body></html>", status=200)

        items = fetch_items(TARGET_URL)
        assert items == []


# ---------------------------------------------------------------------------
# download_image_to_s3
# ---------------------------------------------------------------------------

class TestDownloadImageToS3:

    @mock_aws
    @resp_mock.activate
    def test_uploads_image_to_s3(self):
        # S3バケットを作成
        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        # 画像URLのモック
        resp_mock.add(
            resp_mock.GET,
            "https://example.com/images/hokkaido.jpg",
            body=b"\xff\xd8\xff",  # 最小JPEGヘッダ
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        with patch.dict(os.environ, {"IMAGES_BUCKET": IMAGES_BUCKET}):
            key = download_image_to_s3(
                "https://example.com/images/hokkaido.jpg",
                "北海道 ダイカットキーホルダー",
            )

        assert key.startswith("images/")
        assert key.endswith(".jpg")

        # S3にオブジェクトが存在することを確認
        obj = s3.get_object(Bucket=IMAGES_BUCKET, Key=key)
        assert obj["ContentType"] == "image/jpeg"

    @mock_aws
    @resp_mock.activate
    def test_safe_filename_for_japanese_item_name(self):
        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(
            resp_mock.GET,
            "https://example.com/img.png",
            body=b"\x89PNG",
            status=200,
            headers={"Content-Type": "image/png"},
        )

        with patch.dict(os.environ, {"IMAGES_BUCKET": IMAGES_BUCKET}):
            key = download_image_to_s3(
                "https://example.com/img.png",
                "小樽運河 ダイカットキーホルダー（ちいかわ）",
            )

        # S3キーに不正文字が含まれないこと
        assert "/" in key
        assert "(" not in key
        assert ")" not in key


# ---------------------------------------------------------------------------
# _guess_motif
# ---------------------------------------------------------------------------

class TestGuessMotif:

    def test_chiikawa(self):
        assert _guess_motif("北海道 ダイカットキーホルダー ちいかわ") == "ちいかわ"

    def test_hachiware(self):
        assert _guess_motif("箱根 ダイカットキーホルダー ハチワレver") == "ハチワレ"

    def test_usagi(self):
        assert _guess_motif("東京 ダイカットキーホルダー うさぎ") == "うさぎ"

    def test_default_is_chiikawa(self):
        assert _guess_motif("沖縄 ダイカットキーホルダー") == "ちいかわ"
