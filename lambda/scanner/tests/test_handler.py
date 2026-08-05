import json
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler


def _converse_payload(text: str, stop_reason: str = "end_turn") -> dict:
    return {
        "output": {"message": {"content": [{"text": text}]}},
        "stopReason": stop_reason,
    }


class TestParseEntries:
    def test_構造化JSONをそのまま読む(self):
        text = json.dumps(
            [{"character": "ハチワレ", "area": "大阪", "motif": "たこ焼"}],
            ensure_ascii=False,
        )
        assert handler._parse_entries(text) == [
            {"character": "ハチワレ", "area": "大阪", "motif": "たこ焼"}
        ]

    def test_jsonフェンスと前後の説明文があっても読む(self):
        text = (
            "以下が結果です。\n```json\n"
            '[{"character": "", "area": "北海道", "motif": ""}]\n'
            "```\n以上です。"
        )
        assert handler._parse_entries(text) == [
            {"character": "", "area": "北海道", "motif": ""}
        ]

    def test_配列が閉じていなくても完結したオブジェクトを救出する(self):
        """maxTokens 超過で切り詰められたケース。旧実装は全件ロストしていた。"""
        text = (
            '[{"character": "ちいかわ", "area": "大阪", "motif": "たこ焼"},'
            '{"character": "うさぎ", "area": "京都", "motif": "抹茶ソフト"},'
            '{"character": "ハチワレ", "area": "沖'
        )
        entries = handler._parse_entries(text)
        assert len(entries) == 2
        assert entries[0]["motif"] == "たこ焼"
        assert entries[1]["area"] == "京都"

    def test_旧形式の文字列配列も受け付ける(self):
        """モデルが旧プロンプトの形式で返しても落とさない（後方互換）。"""
        text = '["大阪 たこ焼", "北海道"]'
        assert handler._parse_entries(text) == [
            {"character": "", "area": "", "motif": "大阪 たこ焼"},
            {"character": "", "area": "", "motif": "北海道"},
        ]

    def test_パース不能なら空リスト(self):
        assert handler._parse_entries("読み取れませんでした") == []

    def test_地域もモチーフも空のエントリは捨てる(self):
        text = '[{"character": "ちいかわ", "area": "", "motif": ""}]'
        assert handler._parse_entries(text) == []


class TestExtractEntriesFromImage:
    def test_Bedrock応答からエントリを取り出す(self):
        mock = MagicMock()
        mock.converse.return_value = _converse_payload(
            '[{"character": "うさぎ", "area": "京都", "motif": "八ッ橋"}]'
        )
        with patch.object(handler, "_get_bedrock", return_value=mock):
            entries = handler._extract_entries_from_image(b"dummy", "image/jpeg")

        assert entries == [{"character": "うさぎ", "area": "京都", "motif": "八ッ橋"}]
        config = mock.converse.call_args.kwargs["inferenceConfig"]
        assert config["temperature"] == 0
        assert config["maxTokens"] >= 2000

    def test_未対応のmimeTypeはjpegにフォールバックする(self):
        mock = MagicMock()
        mock.converse.return_value = _converse_payload("[]")
        with patch.object(handler, "_get_bedrock", return_value=mock):
            handler._extract_entries_from_image(b"dummy", "image/heic")

        content = mock.converse.call_args.kwargs["messages"][0]["content"]
        assert content[0]["image"]["format"] == "jpeg"

    def test_max_tokensで打ち切られたら警告する(self, caplog):
        mock = MagicMock()
        mock.converse.return_value = _converse_payload("[]", stop_reason="max_tokens")
        with patch.object(handler, "_get_bedrock", return_value=mock):
            handler._extract_entries_from_image(b"dummy", "image/jpeg")

        assert "max_tokens" in caplog.text


class TestLambdaHandler:
    def test_画像が無ければ400(self):
        event = {"body": json.dumps({})}
        response = handler.lambda_handler(event, MagicMock())
        assert response["statusCode"] == 400

    def test_抽出から照合まで通しで返す(self):
        items = [
            {
                "ItemName": f"{char}　大阪 たこ焼　ダイカットキーホルダー",
                "AreaName": "大阪",
                "Motif": char,
                "Prefecture": "大阪府",
                "ImageUrl": "/images/takoyaki.png",
            }
            for char in ("ちいかわ", "ハチワレ", "うさぎ")
        ]
        bedrock = MagicMock()
        bedrock.converse.return_value = _converse_payload(
            '[{"character": "ハチワレ", "area": "大阪", "motif": "たこ焼"}]'
        )
        table = MagicMock()
        table.scan.return_value = {"Items": items}

        event = {"body": json.dumps({"image": "ZHVtbXk=", "mimeType": "image/jpeg"})}
        with patch.object(handler, "_get_bedrock", return_value=bedrock), \
                patch.object(handler, "_get_table", return_value=table):
            response = handler.lambda_handler(event, MagicMock())

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["areas"] == ["大阪"]
        assert len(body["matched"]) == 1
        assert body["matched"][0]["motif"] == "ハチワレ"
        assert body["matched"][0]["itemDetail"] == "大阪 たこ焼"
        assert body["matched"][0]["confidence"] == "exact"

    def test_地名一体型の商品はareasにモチーフが出る(self):
        """area が空でも「認識できなかった」扱いにしないための表示用フィールド。"""
        bedrock = MagicMock()
        bedrock.converse.return_value = _converse_payload(
            '[{"character": "", "area": "", "motif": "大阪城"}]'
        )
        table = MagicMock()
        table.scan.return_value = {"Items": []}

        event = {"body": json.dumps({"image": "ZHVtbXk="})}
        with patch.object(handler, "_get_bedrock", return_value=bedrock), \
                patch.object(handler, "_get_table", return_value=table):
            response = handler.lambda_handler(event, MagicMock())

        body = json.loads(response["body"])
        assert body["areas"] == ["大阪城"]
        assert body["matched"] == []

    def test_エントリが無ければDBを引かない(self):
        bedrock = MagicMock()
        bedrock.converse.return_value = _converse_payload("読み取れませんでした")
        table = MagicMock()

        event = {"body": json.dumps({"image": "ZHVtbXk="})}
        with patch.object(handler, "_get_bedrock", return_value=bedrock), \
                patch.object(handler, "_get_table", return_value=table):
            response = handler.lambda_handler(event, MagicMock())

        body = json.loads(response["body"])
        assert body["matched"] == []
        table.scan.assert_not_called()

    def test_base64エンコードされたbodyを解ける(self):
        import base64 as b64

        bedrock = MagicMock()
        bedrock.converse.return_value = _converse_payload("[]")
        table = MagicMock()
        raw = json.dumps({"image": "ZHVtbXk="})
        event = {
            "body": b64.b64encode(raw.encode()).decode(),
            "isBase64Encoded": True,
        }
        with patch.object(handler, "_get_bedrock", return_value=bedrock), \
                patch.object(handler, "_get_table", return_value=table):
            response = handler.lambda_handler(event, MagicMock())

        assert response["statusCode"] == 200

    def test_例外は500で返す(self):
        bedrock = MagicMock()
        bedrock.converse.side_effect = RuntimeError("bedrock down")
        event = {"body": json.dumps({"image": "ZHVtbXk="})}
        with patch.object(handler, "_get_bedrock", return_value=bedrock):
            response = handler.lambda_handler(event, MagicMock())

        assert response["statusCode"] == 500
