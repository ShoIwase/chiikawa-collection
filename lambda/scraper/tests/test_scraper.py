import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import pytest
import responses as resp_mock
import boto3
from unittest.mock import patch, MagicMock
from moto import mock_aws

from scraper import (
    fetch_items,
    fetch_image_from_url,
    upload_image_to_s3,
    download_image_to_s3,
    analyze_image,
    crop_character,
    _guess_motif,
)

IMAGES_BUCKET = "chiikawa-images-123456789012"
TARGET_URL    = "https://www.jp-api.com/contents/NOD62/"

# ---------------------------------------------------------------------------
# fetch_items
# ---------------------------------------------------------------------------

# jp-api.com の実際の HTML 構造に合わせたサンプル
# 商品名は a.lightbox の title 属性、画像 URL は href 属性
SAMPLE_HTML = """
<html><body>
  <div class="item_box_3">
    <p class="img_023 img">
      <a class="lightbox" href="/images/hokkaido.png" title="北海道 ダイカットキーホルダー">
        <img src="/images/hokkaido.png" alt="北海道 ダイカットキーホルダー" />
      </a>
    </p>
  </div>
  <div class="item_box_3">
    <p class="img_023 img">
      <a class="lightbox" href="/images/tokyo_badge.png" title="東京 缶バッジ">
        <img src="/images/tokyo_badge.png" alt="東京 缶バッジ" />
      </a>
    </p>
  </div>
  <div class="item_box_3">
    <p class="img_023 img">
      <a class="lightbox" href="/images/hakone.png" title="箱根 ダイカットキーホルダー ハチワレver">
        <img src="/images/hakone.png" alt="箱根 ダイカットキーホルダー ハチワレver" />
      </a>
    </p>
  </div>
</body></html>
"""


def _sjis(html: str) -> bytes:
    """テスト用: HTML 文字列を Shift-JIS バイト列に変換する。"""
    return html.encode("shift_jis")


class TestFetchItems:

    @resp_mock.activate
    def test_filters_keychain_items_only(self):
        # scraper は Shift-JIS でデコードするためバイト列で渡す
        resp_mock.add(resp_mock.GET, TARGET_URL, body=_sjis(SAMPLE_HTML), status=200)

        items = fetch_items(TARGET_URL)

        names = [i.item_name for i in items]
        assert any("ダイカットキーホルダー" in n for n in names)
        assert all("缶バッジ" not in n for n in names)

    @resp_mock.activate
    def test_returns_two_keychain_items(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body=_sjis(SAMPLE_HTML), status=200)

        items = fetch_items(TARGET_URL)
        assert len(items) == 2

    @resp_mock.activate
    def test_image_url_is_absolute(self):
        resp_mock.add(resp_mock.GET, TARGET_URL, body=_sjis(SAMPLE_HTML), status=200)

        items = fetch_items(TARGET_URL)
        for item in items:
            if item.image_url_original:
                assert item.image_url_original.startswith("http")

    @resp_mock.activate
    def test_empty_page_returns_empty_list(self):
        resp_mock.add(resp_mock.GET, TARGET_URL,
                      body="<html><body></body></html>".encode("shift_jis"), status=200)

        items = fetch_items(TARGET_URL)
        assert items == []


# ---------------------------------------------------------------------------
# fetch_image_from_url / upload_image_to_s3 / download_image_to_s3
# ---------------------------------------------------------------------------

class TestImageFunctions:

    @resp_mock.activate
    def test_fetch_image_from_url_returns_bytes_and_content_type(self):
        resp_mock.add(
            resp_mock.GET,
            "https://example.com/images/hokkaido.jpg",
            body=b"\xff\xd8\xff",
            status=200,
            headers={"Content-Type": "image/jpeg"},
        )

        data, ct = fetch_image_from_url("https://example.com/images/hokkaido.jpg")
        assert data == b"\xff\xd8\xff"
        assert ct == "image/jpeg"

    @mock_aws
    def test_upload_image_to_s3_stores_object(self):
        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        with patch.dict(os.environ, {"IMAGES_BUCKET": IMAGES_BUCKET}):
            key = upload_image_to_s3(b"\xff\xd8\xff", "北海道 ダイカットキーホルダー", "image/jpeg")

        assert key.startswith("images/")
        assert key.endswith(".jpg")
        obj = s3.get_object(Bucket=IMAGES_BUCKET, Key=key)
        assert obj["ContentType"] == "image/jpeg"

    @mock_aws
    @resp_mock.activate
    def test_download_image_to_s3_backward_compat(self):
        s3 = boto3.client("s3", region_name="ap-northeast-1")
        s3.create_bucket(
            Bucket=IMAGES_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
        )

        resp_mock.add(
            resp_mock.GET,
            "https://example.com/images/hokkaido.jpg",
            body=b"\xff\xd8\xff",
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

        assert "/" in key
        assert "(" not in key
        assert ")" not in key


# ---------------------------------------------------------------------------
# analyze_image
# ---------------------------------------------------------------------------

def _bedrock_response(characters: list[str], region: str = "", area_type: str = "",
                      prefecture: str = "") -> dict:
    """Bedrock converse のレスポンス形式（characters + region + areaType + prefecture）をシミュレートする。"""
    payload = {
        "characters": characters,
        "region": region,
        "areaType": area_type,
        "prefecture": prefecture,
    }
    return {
        "output": {
            "message": {
                "content": [{"text": json.dumps(payload)}]
            }
        }
    }


class TestAnalyzeImage:

    def test_detects_all_three_characters(self):
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(
            ["ちいかわ", "ハチワレ", "うさぎ"]
        )

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["characters"] == ["ちいかわ", "ハチワレ", "うさぎ"]

    def test_detects_single_character(self):
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(["ハチワレ"])

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["characters"] == ["ハチワレ"]

    def test_extracts_region_area_type_prefecture(self):
        """画像から地域名・エリア種別・所属都道府県を抽出する。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(
            ["ちいかわ"], region="市川市", area_type="市区町村", prefecture="千葉県"
        )

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["region"] == "市川市"
        assert result["areaType"] == "市区町村"
        assert result["prefecture"] == "千葉県"

    def test_invalid_area_type_normalized_to_empty(self):
        """3値以外の areaType は空文字に正規化される。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(
            ["ちいかわ"], region="鎌倉", area_type="県"
        )

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["areaType"] == ""

    def test_strips_gentei_suffix_from_region(self):
        """『静岡限定』のような表記から『限定』を除去する。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(["ちいかわ"], region="静岡限定")

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["region"] == "静岡"

    def test_filters_invalid_characters(self):
        """ちいかわ3キャラ以外の名前は除外される。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = _bedrock_response(
            ["ちいかわ", "くりまんじゅう", "モモンガ"]
        )

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["characters"] == ["ちいかわ"]

    def test_parses_markdown_code_fenced_response(self):
        """モデルが ```json ... ``` で包んで返しても正しくパースする。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{
                "text": '```json\n{"characters": ["ちいかわ", "ハチワレ"], "region": "京都", "areaType": "都道府県"}\n```'
            }]}}
        }

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result["characters"] == ["ちいかわ", "ハチワレ"]
        assert result["region"] == "京都"
        assert result["areaType"] == "都道府県"

    def test_returns_empty_on_invalid_json(self):
        """不正なレスポンスは空の結果を返す。"""
        mock_bedrock = MagicMock()
        mock_bedrock.converse.return_value = {
            "output": {"message": {"content": [{"text": "キャラクターは見つかりません"}]}}
        }

        with patch("scraper.boto3") as mock_boto3:
            mock_boto3.client.return_value = mock_bedrock
            result = analyze_image(b"\xff\xd8\xff", "image/jpeg")

        assert result == {"characters": [], "region": "", "areaType": "", "prefecture": ""}


# ---------------------------------------------------------------------------
# crop_character
# ---------------------------------------------------------------------------

class TestCropCharacter:

    def _three_charm_png(self) -> bytes:
        """実際の柄中心(0.20/0.50/0.79 W, 0.55 H)に色付き四角を置いた 700x600 PNG。"""
        Image = pytest.importorskip("PIL.Image")
        import io
        im = Image.new("RGB", (700, 600), (255, 255, 255))  # 白背景
        cy = int(600 * 0.55)
        for cx_ratio, color in [(0.20, (255, 0, 0)), (0.50, (0, 255, 0)), (0.79, (0, 0, 255))]:
            cx = int(700 * cx_ratio)
            im.paste(color, (cx - 60, cy - 60, cx + 60, cy + 60))  # 120x120 の柄
        buf = io.BytesIO(); im.save(buf, format="PNG")
        return buf.getvalue()

    def test_crops_square_centered_on_charm(self):
        Image = pytest.importorskip("PIL.Image")
        import io
        data = self._three_charm_png()
        side = int(700 * 0.40)  # 280
        # 各キャラの柄中心が切り抜きの中心(=側長/2)に来て、その色になる
        for character, color in [("ちいかわ", (255, 0, 0)), ("ハチワレ", (0, 255, 0)), ("うさぎ", (0, 0, 255))]:
            crop = Image.open(io.BytesIO(crop_character(data, "image/png", character))).convert("RGB")
            assert crop.size == (side, side)  # 正方形
            assert crop.getpixel((side // 2, side // 2)) == color

    def test_unknown_character_returns_original(self):
        data = b"\xff\xd8\xff"
        assert crop_character(data, "image/jpeg", "モモンガ") == data

    def test_invalid_image_falls_back_to_original(self):
        # PIL が無い環境や壊れた画像では元バイト列を返す
        data = b"not-an-image"
        assert crop_character(data, "image/png", "ちいかわ") == data


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

    def test_momonga_katakana(self):
        assert _guess_motif("那覇 ダイカットキーホルダー モモンガ") == "モモンガ"

    def test_momonga_romaji_returns_katakana(self):
        # "momonga" (ローマ字) も "モモンガ" として統一
        assert _guess_motif("那覇 ダイカットキーホルダー momonga") == "モモンガ"

    def test_default_is_chiikawa(self):
        assert _guess_motif("沖縄 ダイカットキーホルダー") == "ちいかわ"
