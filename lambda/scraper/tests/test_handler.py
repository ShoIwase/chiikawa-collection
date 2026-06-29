import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import json
import responses as resp_mock
from unittest.mock import patch, MagicMock
from moto import mock_aws

IMAGES_BUCKET  = "chiikawa-images-123456789012"
MASTER_TABLE   = "ChiikawaMaster"
TARGET_URL     = "https://www.jp-api.com/contents/NOD62/"

# scraper.py は resp.encoding = "shift_jis" で強制デコードするため、
# モックレスポンスも Shift-JIS バイト列にする必要がある
MINIMAL_HTML_BYTES = """
<html><body>
<div class="item">
  <a class="lightbox" href="/images/hokkaido_b.png" title="北海道 ダイカットキーホルダー">
    <img src="/images/hokkaido_b.png" alt="北海道 ダイカットキーホルダー"/>
  </a>
  <p class="itemname"><a href="#">北海道 ダイカットキーホルダー</a></p>
  <p class="character">ちいかわ</p>
</div>
</body></html>
""".encode("shift_jis")


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


def _make_bedrock_client(characters: list[str]):
    """指定キャラクターを返す Bedrock クライアントのモックを作成する。"""
    body_bytes = json.dumps({"content": [{"text": json.dumps(characters)}]}).encode()
    mock_bedrock = MagicMock()
    mock_bedrock.invoke_model.return_value = {
        "body": MagicMock(read=MagicMock(return_value=body_bytes))
    }
    return mock_bedrock


def _env(extra: dict = {}) -> dict:
    base = {
        "MASTER_TABLE":  MASTER_TABLE,
        "TARGET_URL":    TARGET_URL,
        "IMAGES_BUCKET": IMAGES_BUCKET,
        "AWS_REGION":    "ap-northeast-1",
    }
    return {**base, **extra}


class TestHandlerCharacterSplitting:

    @mock_aws
    @resp_mock.activate
    def test_creates_three_entries_when_all_characters_detected(self):
        """画像から3キャラが検出された場合、3件のDynamoDBエントリが作成される。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML_BYTES, status=200,
                      headers={"Content-Type": "text/html; charset=shift_jis"})
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        mock_bedrock = _make_bedrock_client(["ちいかわ", "ハチワレ", "うさぎ"])

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200

        for character in ["ちいかわ", "ハチワレ", "うさぎ"]:
            entry_name = f"北海道 ダイカットキーホルダー {character}"
            item = table.get_item(
                Key={"Category": "KeyChain", "ItemName": entry_name}
            ).get("Item")
            assert item is not None, f"エントリが存在しない: {entry_name}"
            assert item["Motif"] == character
            assert item["ImageUrl"].startswith("/images/")

    @mock_aws
    @resp_mock.activate
    def test_creates_one_entry_when_single_character_detected(self):
        """1キャラのみ検出された場合、1件のみ作成される。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML_BYTES, status=200)
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        mock_bedrock = _make_bedrock_client(["ハチワレ"])

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        hachiware_item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー ハチワレ"}
        ).get("Item")
        assert hachiware_item is not None

        # ちいかわ・うさぎは登録されないこと
        for char in ["ちいかわ", "うさぎ"]:
            other_item = table.get_item(
                Key={"Category": "KeyChain", "ItemName": f"北海道 ダイカットキーホルダー {char}"}
            ).get("Item")
            assert other_item is None, f"{char} が余分に登録された"

    @mock_aws
    @resp_mock.activate
    def test_fallback_to_motif_when_detection_fails(self):
        """Bedrock が空リストを返した場合、名前ベースのMotifでフォールバックする。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML_BYTES, status=200)
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        mock_bedrock = _make_bedrock_client([])  # 空=検出失敗

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        # フォールバックは _guess_motif("北海道 ダイカットキーホルダー") = "ちいかわ"
        item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー ちいかわ"}
        ).get("Item")
        assert item is not None
        assert item["Motif"] == "ちいかわ"


class TestHandlerImageUrl:

    @mock_aws
    @resp_mock.activate
    def test_image_url_has_no_double_images_path(self):
        """ImageUrl が /images/images/xxx になっていないこと（バグ修正の回帰テスト）"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML_BYTES, status=200,
                      headers={"Content-Type": "text/html; charset=shift_jis"})
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        mock_bedrock = _make_bedrock_client(["ちいかわ"])

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        dynamodb2 = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table2 = dynamodb2.Table(MASTER_TABLE)
        item = table2.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー ちいかわ"}
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

        resp_mock.add(resp_mock.GET, TARGET_URL, body=MINIMAL_HTML_BYTES, status=200,
                      headers={"Content-Type": "text/html; charset=shift_jis"})
        resp_mock.add(
            resp_mock.GET,
            "https://www.jp-api.com/images/hokkaido_b.png",
            status=404,
        )

        # 画像DL失敗時はdetect_characterを呼ばない → Bedrockモック不要
        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3"):
                from handler import lambda_handler
                result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200

        dynamodb2 = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table2 = dynamodb2.Table(MASTER_TABLE)

        # フォールバック: motif="ちいかわ"(デフォルト) でエントリが作られる
        item = table2.get_item(
            Key={"Category": "KeyChain", "ItemName": "北海道 ダイカットキーホルダー ちいかわ"}
        ).get("Item")

        if item:
            assert item.get("ImageUrl", "") == ""
