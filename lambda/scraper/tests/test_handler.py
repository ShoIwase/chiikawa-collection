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
# モックレスポンスも Shift-JIS バイト列にする必要がある。
# 画像URLは数値ID付き(tphoto_5000_b.png)にして SourceImageId を持たせる。
MINIMAL_HTML_BYTES = """
<html><body>
<div class="item">
  <a class="lightbox" href="/images/tphoto_5000_b.png" title="北海道 ダイカットキーホルダー">
    <img src="/images/tphoto_5000_b.png" alt="北海道 ダイカットキーホルダー"/>
  </a>
  <p class="itemname"><a href="#">北海道 ダイカットキーホルダー</a></p>
  <p class="character">ちいかわ</p>
</div>
</body></html>
""".encode("shift_jis")

HOKKAIDO_IMG = "https://www.jp-api.com/images/tphoto_5000_b.png"


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


def _converse_payload(characters: list[str], region: str = "", area_type: str = "") -> dict:
    return {
        "output": {"message": {"content": [{
            "text": json.dumps({
                "characters": characters,
                "region": region,
                "areaType": area_type,
            })
        }]}}
    }


def _make_bedrock_client(characters: list[str], region: str = "", area_type: str = ""):
    """指定キャラクター・地域・エリア種別を返す Bedrock クライアントのモックを作成する。"""
    mock_bedrock = MagicMock()
    mock_bedrock.converse.return_value = _converse_payload(characters, region, area_type)
    return mock_bedrock


def _env(extra: dict = {}) -> dict:
    base = {
        "MASTER_TABLE":  MASTER_TABLE,
        "TARGET_URL":    TARGET_URL,
        "IMAGES_BUCKET": IMAGES_BUCKET,
        "AWS_REGION":    "ap-northeast-1",
    }
    return {**base, **extra}


def _add_target(html=MINIMAL_HTML_BYTES):
    resp_mock.add(resp_mock.GET, TARGET_URL, body=html, status=200,
                  headers={"Content-Type": "text/html; charset=shift_jis"})


def _add_image(url=HOKKAIDO_IMG, status=200):
    kwargs = {"status": status}
    if status == 200:
        kwargs.update(body=b"\xff\xd8\xff", headers={"Content-Type": "image/jpeg"})
    resp_mock.add(resp_mock.GET, url, **kwargs)


class TestHandlerCharacterSplitting:

    @mock_aws
    @resp_mock.activate
    def test_creates_three_entries_when_all_characters_detected(self):
        """画像から3キャラが検出された場合、3件のDynamoDBエントリが作成される（キャラ先頭命名）。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        _add_target()
        _add_image()

        mock_bedrock = _make_bedrock_client(
            ["ちいかわ", "ハチワレ", "うさぎ"], region="北海道", area_type="都道府県"
        )

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200

        for character in ["ちいかわ", "ハチワレ", "うさぎ"]:
            entry_name = f"{character}　北海道　ダイカットキーホルダー"
            item = table.get_item(
                Key={"Category": "KeyChain", "ItemName": entry_name}
            ).get("Item")
            assert item is not None, f"エントリが存在しない: {entry_name}"
            assert item["Motif"] == character
            assert item["AreaType"] == "都道府県"
            assert item["AreaName"] == "北海道"
            assert item["ImageUrl"].startswith("/images/")
            assert item["SourceImageId"] == "5000"

    @mock_aws
    @resp_mock.activate
    def test_auto_tags_character_and_area(self):
        """新規作成時に Tags へ [キャラ, 地名] が自動付与される。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        _add_target()
        _add_image()

        mock_bedrock = _make_bedrock_client(["うさぎ"], region="北海道", area_type="都道府県")

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "うさぎ　北海道　ダイカットキーホルダー"}
        )["Item"]
        assert item["Tags"] == {"うさぎ", "北海道"}

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

        _add_target()
        _add_image()

        mock_bedrock = _make_bedrock_client(["ハチワレ"], region="北海道", area_type="都道府県")

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        hachiware_item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "ハチワレ　北海道　ダイカットキーホルダー"}
        ).get("Item")
        assert hachiware_item is not None

        # ちいかわ・うさぎは登録されないこと
        for char in ["ちいかわ", "うさぎ"]:
            other_item = table.get_item(
                Key={"Category": "KeyChain", "ItemName": f"{char}　北海道　ダイカットキーホルダー"}
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

        _add_target()
        _add_image()

        mock_bedrock = _make_bedrock_client([])  # 空=検出失敗、region も空

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        # フォールバック: characters=[_guess_motif("北海道 …")="ちいかわ"]、region空→名前から推測
        item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "ちいかわ　北海道　ダイカットキーホルダー"}
        ).get("Item")
        assert item is not None
        assert item["Motif"] == "ちいかわ"
        assert item["AreaType"] == "都道府県"
        assert item["AreaName"] == "北海道"


_COLLISION_HTML_BYTES = """
<html><body>
<div class="item">
  <a class="lightbox" href="/images/tphoto_1110_0_b.png" title="みかん ダイカットキーホルダー">
    <img src="/images/tphoto_1110_0_b.png" alt="みかん ダイカットキーホルダー"/>
  </a>
</div>
<div class="item">
  <a class="lightbox" href="/images/tphoto_2220_0_b.png" title="みかん ダイカットキーホルダー">
    <img src="/images/tphoto_2220_0_b.png" alt="みかん ダイカットキーホルダー"/>
  </a>
</div>
</body></html>
""".encode("shift_jis")


class TestHandlerCollisionDisambiguation:

    @mock_aws
    @resp_mock.activate
    def test_same_name_different_region_creates_distinct_entries(self):
        """同名商品でも地域が違えば別エントリとして保存される（取りこぼし防止）。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        _add_target(_COLLISION_HTML_BYTES)
        for pid in ("1110", "2220"):
            _add_image(f"https://www.jp-api.com/images/tphoto_{pid}_0_b.png")

        # 1件目は静岡、2件目は和歌山を返す
        mock_bedrock = MagicMock()
        mock_bedrock.converse.side_effect = [
            _converse_payload(["ちいかわ", "ハチワレ", "うさぎ"], region="静岡", area_type="都道府県"),
            _converse_payload(["ちいかわ", "ハチワレ", "うさぎ"], region="和歌山", area_type="都道府県"),
        ]

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        # 静岡・和歌山それぞれ3キャラ = 計6エントリが揃うこと
        for region in ("静岡", "和歌山"):
            for character in ("ちいかわ", "ハチワレ", "うさぎ"):
                name = f"{character}　{region} みかん　ダイカットキーホルダー"
                item = table.get_item(
                    Key={"Category": "KeyChain", "ItemName": name}
                ).get("Item")
                assert item is not None, f"エントリが存在しない: {name}"
                assert item["AreaType"] == "都道府県"
                assert item["AreaName"] == region

        cnt = table.scan(Select="COUNT")["Count"]
        assert cnt == 6, f"期待6件に対し {cnt} 件"


class TestHandlerAreaOther:

    @mock_aws
    @resp_mock.activate
    def test_region_other_bucket(self):
        """広域（関西など）は AreaType=その他 に分類される。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        html = """
<html><body>
<div class="item">
  <a class="lightbox" href="/images/tphoto_7770_b.png" title="たこ焼き ダイカットキーホルダー">
    <img src="/images/tphoto_7770_b.png" alt="たこ焼き ダイカットキーホルダー"/>
  </a>
</div>
</body></html>
""".encode("shift_jis")
        _add_target(html)
        _add_image("https://www.jp-api.com/images/tphoto_7770_b.png")

        mock_bedrock = _make_bedrock_client(["ちいかわ"], region="関西", area_type="その他")

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        item = table.get_item(
            Key={"Category": "KeyChain", "ItemName": "ちいかわ　関西 たこ焼き　ダイカットキーホルダー"}
        ).get("Item")
        assert item is not None
        assert item["AreaType"] == "その他"
        assert item["AreaName"] == "関西"


class TestHandlerIncrementalSkip:

    @mock_aws
    @resp_mock.activate
    def test_skips_product_with_existing_source_image_id(self):
        """SourceImageId が既出の商品は丸ごとスキップされる。"""
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = _make_table(dynamodb)
        # 画像ID=111 の商品は登録済みとする
        table.put_item(Item={
            "Category": "KeyChain",
            "ItemName": "ちいかわ　静岡 みかん　ダイカットキーホルダー",
            "Motif": "ちいかわ",
            "AreaType": "都道府県",
            "AreaName": "静岡",
            "ImageUrl": "/images/x.jpg",
            "IsVerified": False,
            "CreatedAt": "2026-01-01T00:00:00Z",
            "SourceImageId": "1110",
        })

        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        _add_target(_COLLISION_HTML_BYTES)
        # 222 のみ取得される想定（111はスキップ）
        _add_image("https://www.jp-api.com/images/tphoto_2220_0_b.png")

        mock_bedrock = _make_bedrock_client(
            ["ちいかわ", "ハチワレ", "うさぎ"], region="和歌山", area_type="都道府県"
        )

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200
        # 111(静岡)は再取得されず1件のまま、222(和歌山)が3件追加 → 計4件
        cnt = table.scan(Select="COUNT")["Count"]
        assert cnt == 4, f"期待4件に対し {cnt} 件"
        # Bedrock は222の1回のみ呼ばれる
        assert mock_bedrock.converse.call_count == 1


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

        _add_target()
        _add_image()

        mock_bedrock = _make_bedrock_client(["ちいかわ"], region="北海道", area_type="都道府県")

        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3") as mock_scraper_boto3:
                mock_scraper_boto3.client.return_value = mock_bedrock
                from handler import lambda_handler
                lambda_handler({}, MagicMock())

        dynamodb2 = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table2 = dynamodb2.Table(MASTER_TABLE)
        item = table2.get_item(
            Key={"Category": "KeyChain", "ItemName": "ちいかわ　北海道　ダイカットキーホルダー"}
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

        _add_target()
        _add_image(status=404)

        # 画像DL失敗時は analyze_image を呼ばない → Bedrockモック不要
        with patch.dict(os.environ, _env()):
            with patch("scraper.boto3"):
                from handler import lambda_handler
                result = lambda_handler({}, MagicMock())

        assert result["statusCode"] == 200

        dynamodb2 = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table2 = dynamodb2.Table(MASTER_TABLE)

        # フォールバック: motif="ちいかわ"(デフォルト) でエントリが作られる
        item = table2.get_item(
            Key={"Category": "KeyChain", "ItemName": "ちいかわ　北海道　ダイカットキーホルダー"}
        ).get("Item")

        if item:
            assert item.get("ImageUrl", "") == ""
