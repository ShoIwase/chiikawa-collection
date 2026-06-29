import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import responses as resp_mock
from unittest.mock import patch, MagicMock
from moto import mock_aws

IMAGES_BUCKET  = "chiikawa-images-123456789012"
MASTER_TABLE   = "ChiikawaMaster"
TARGET_URL     = "https://www.jp-api.com/contents/NOD62/"

MINIMAL_HTML = """
<html><body>
<div class="item">
  <a class="lightbox" href="/images/hokkaido_b.png" title="北海道 ダイカットキーホルダー">
    <img src="/images/hokkaido_b.png" alt="北海道 ダイカットキーホルダー"/>
  </a>
  <p class="itemname"><a href="#">北海道 ダイカットキーホルダー</a></p>
  <p class="character">ちいかわ</p>
</div>
</body></html>
"""


def _make_table(dynamodb):
    return dynamodb.create_table(
        TableName=MASTER_TABLE,
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[
            {"AttributeName": "Category", "KeyType": "HASH"},
            {"AttributeName": "ItemName",  "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "Category", "AttributeType": "S"},
            {"AttributeName": "ItemName",  "AttributeType": "S"},
        ],
    )


class TestHandlerImageUrl:

    @mock_aws
    @resp_mock.activate
    def test_image_url_has_no_double_images_path(self):
        """ImageUrl が /images/images/xxx になっていないこと（バグ修正の回帰テスト）"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        # スクレイプ対象HTML
        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML, status=200,
                      headers={"Content-Type": "text/html; charset=utf-8"})

        # 画像ダウンロードのモック
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        env = {
            "MASTER_TABLE":  MASTER_TABLE,
            "TARGET_URL":    TARGET_URL,
            "IMAGES_BUCKET": IMAGES_BUCKET,
        }
        with patch.dict(os.environ, env):
            from handler import lambda_handler
            lambda_handler({}, MagicMock())

        item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー"}
        )["Item"]

        image_url = item["ImageUrl"]
        assert image_url != "", "ImageUrl が空"
        assert not image_url.startswith("/images/images/"), \
            f"二重パス検出: {image_url}"
        assert image_url.startswith("/images/"), \
            f"期待するプレフィックス '/images/' がない: {image_url}"

    @mock_aws
    @resp_mock.activate
    def test_image_url_is_empty_when_download_fails(self):
        """画像ダウンロード失敗時は ImageUrl が空文字になること"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML, status=200,
                      headers={"Content-Type": "text/html; charset=utf-8"})
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            status=404,
        )

        env = {
            "MASTER_TABLE":  MASTER_TABLE,
            "TARGET_URL":    TARGET_URL,
            "IMAGES_BUCKET": IMAGES_BUCKET,
        }
        with patch.dict(os.environ, env):
            from handler import lambda_handler
            result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200

        dynamodb2 = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table2 = dynamodb2.Table(MASTER_TABLE)
        item = table2.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー"}
        ).get("Item")

        if item:
            assert item.get("ImageUrl", "") == ""
