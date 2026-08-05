import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from matcher import (
    SCORE_AREA,
    SCORE_EXACT,
    SCORE_PARTIAL,
    dice,
    extract_areas,
    item_core,
    match_items,
    normalize,
)

CHARS = ("ちいかわ", "ハチワレ", "うさぎ")

# 実データ（ChiikawaMaster）の構造をそのまま写した商品定義: AreaName -> 商品名コア
_CATALOG = {
    "大阪": [
        "大阪 たこ焼", "大阪 ミックスジュース", "大阪 通天閣",
        "大阪のおばちゃん", "大阪城",
    ],
    "京都": [
        "京都 伏見稲荷", "京都 八ッ橋", "京都 抹茶ソフト", "京都 新選組",
        "ニデック京都タワー",
    ],
    "東京": [
        "東京 パンダ", "東京 雷門", "東京スカイツリー", "東京タワー",
        "東京駅 丸の内駅舎",
    ],
    # 「北海道」単体の商品と「北海道 ○○」が同居する（モチーフ無し商品のテスト用）
    "北海道": [
        "北海道", "北海道 くま", "北海道 シマエナガ", "北海道 メロン",
        "北海道 ラベンダー", "北海道 小樽運河",
    ],
}


def _items():
    """全キャラ分に展開した DB アイテム列を作る。"""
    out = []
    for area, cores in _CATALOG.items():
        for core in cores:
            for char in CHARS:
                out.append({
                    "ItemName": f"{char}　{core}　ダイカットキーホルダー",
                    "AreaName": area,
                    "Motif": char,
                    "Prefecture": "",
                    "ImageUrl": f"/images/{core}-{char}.png",
                })
    return out


ITEMS = _items()
AREAS = list(_CATALOG.keys())


def _details(results):
    return sorted({r["itemDetail"] for r in results})


class TestNormalize:
    def test_全角スペースと全角英数を吸収する(self):
        assert normalize("大阪　ＴＡＫＯ") == normalize("大阪tako")

    def test_半角カナを全角に統一する(self):
        assert normalize("ﾊﾁﾜﾚ") == normalize("ハチワレ")

    def test_空白は位置を問わず除去される(self):
        assert normalize("大阪 たこ焼") == normalize("大阪たこ焼")

    def test_Noneや空文字でも落ちない(self):
        assert normalize("") == ""
        assert normalize(None) == ""


class TestItemCore:
    def test_半角スペース区切りの商品名を取り出す(self):
        name = "ちいかわ　大阪 たこ焼　ダイカットキーホルダー"
        assert item_core(name, "ちいかわ") == "大阪 たこ焼"

    def test_区切りのない商品名を取り出す(self):
        name = "ちいかわ　大阪城　ダイカットキーホルダー"
        assert item_core(name, "ちいかわ") == "大阪城"

    def test_地名のみの商品名を取り出す(self):
        name = "ちいかわ　北海道　ダイカットキーホルダー"
        assert item_core(name, "ちいかわ") == "北海道"

    def test_商品名が無い場合は空文字を返す(self):
        assert item_core("ちいかわ　ダイカットキーホルダー", "ちいかわ") == ""

    def test_Motifが空でも既知キャラ名で剥がせる(self):
        name = "ハチワレ　大阪 たこ焼　ダイカットキーホルダー"
        assert item_core(name, "") == "大阪 たこ焼"


class TestExtractAreas:
    def test_東京都は京都に誤マッチしない(self):
        """最長一致で「東京」を取るため、残りの「都」から「京都」は成立しない。"""
        assert extract_areas("東京都 パンダ", AREAS) == ["東京"]

    def test_都道府県の正式名サフィックスを吸収する(self):
        assert extract_areas("大阪府 たこ焼", AREAS) == ["大阪"]

    def test_地名が中間に埋没していても拾える(self):
        assert extract_areas("ニデック京都タワー", AREAS) == ["京都"]

    def test_区切りのない地名を拾える(self):
        assert extract_areas("大阪城", AREAS) == ["大阪"]

    def test_同じ地名は一度だけ返す(self):
        assert extract_areas("大阪 大阪城", AREAS) == ["大阪"]

    def test_該当なしなら空リスト(self):
        assert extract_areas("スイス チョコ", AREAS) == []


class TestDice:
    def test_表記ゆれを高スコアで拾う(self):
        assert dice(normalize("たこ焼き"), normalize("たこ焼")) >= 0.5

    def test_無関係な語は低スコア(self):
        assert dice(normalize("たこ焼"), normalize("通天閣")) < 0.5


class TestMatchItems:
    def test_地名とモチーフの組で該当商品だけに絞る(self):
        """0件バグの回帰テスト。

        旧実装は「大阪 たこ焼」を AreaName と完全一致で照合していたため
        構造的に0件だった。地名+モチーフで該当1商品×3キャラに絞れること。
        """
        results = match_items(
            [{"character": "", "area": "大阪", "motif": "たこ焼"}], ITEMS
        )
        assert _details(results) == ["大阪 たこ焼"]
        assert len(results) == 3
        assert {r["confidence"] for r in results} == {"exact"}

    def test_キャラが読めていれば1件に絞る(self):
        results = match_items(
            [{"character": "ハチワレ", "area": "大阪", "motif": "たこ焼"}], ITEMS
        )
        assert len(results) == 1
        assert results[0]["motif"] == "ハチワレ"
        assert results[0]["itemDetail"] == "大阪 たこ焼"

    def test_キャラが誤認識でも0件にはしない(self):
        """該当キャラが候補に無ければ絞り込みを諦める。"""
        results = match_items(
            [{"character": "モモンガ", "area": "大阪", "motif": "たこ焼"}], ITEMS
        )
        assert len(results) == 3

    def test_地域しか読めない場合は候補をまとめて返す(self):
        results = match_items(
            [{"character": "", "area": "京都", "motif": ""}], ITEMS
        )
        assert len(results) == len(_CATALOG["京都"]) * len(CHARS)
        assert {r["confidence"] for r in results} == {"area"}

    def test_地名のみの商品はモチーフ無しで確定できる(self):
        """「北海道 くま」等が同居していても「北海道」単体を選ぶ。"""
        results = match_items(
            [{"character": "", "area": "北海道", "motif": ""}], ITEMS
        )
        assert _details(results) == ["北海道"]
        assert {r["confidence"] for r in results} == {"exact"}

    def test_助詞つきの商品名を拾える(self):
        results = match_items(
            [{"character": "", "area": "大阪", "motif": "おばちゃん"}], ITEMS
        )
        assert _details(results) == ["大阪のおばちゃん"]

    def test_地名が埋没した商品名を拾える(self):
        results = match_items(
            [{"character": "", "area": "", "motif": "ニデック京都タワー"}], ITEMS
        )
        assert _details(results) == ["ニデック京都タワー"]

    def test_表記ゆれは部分一致で拾う(self):
        results = match_items(
            [{"character": "", "area": "大阪", "motif": "たこ焼き"}], ITEMS
        )
        assert _details(results) == ["大阪 たこ焼"]
        assert {r["confidence"] for r in results} == {"partial"}

    def test_東京都と書かれても京都の商品を返さない(self):
        results = match_items(
            [{"character": "", "area": "東京都", "motif": "パンダ"}], ITEMS
        )
        assert _details(results) == ["東京 パンダ"]
        assert all(r["areaName"] == "東京" for r in results)

    def test_地域が読めなくてもモチーフの完全包含で救済する(self):
        results = match_items(
            [{"character": "", "area": "", "motif": "丸の内駅舎"}], ITEMS
        )
        assert _details(results) == ["東京駅 丸の内駅舎"]

    def test_重複は最も確度の高いスコアを残す(self):
        """同じアイテムが exact と area の両方で来たら exact を残す。"""
        results = match_items(
            [
                {"character": "", "area": "大阪", "motif": "たこ焼"},
                {"character": "", "area": "大阪", "motif": ""},
            ],
            ITEMS,
        )
        names = [r["itemName"] for r in results]
        assert len(names) == len(set(names)), "同一アイテムが重複している"
        assert len(results) == len(_CATALOG["大阪"]) * len(CHARS)
        by_detail = {r["itemDetail"]: r["confidence"] for r in results}
        assert by_detail["大阪 たこ焼"] == "exact"
        assert by_detail["大阪城"] == "area"

    def test_返却値に表示用フィールドが含まれる(self):
        results = match_items(
            [{"character": "ちいかわ", "area": "大阪", "motif": "たこ焼"}], ITEMS
        )
        assert results[0] == {
            "itemName": "ちいかわ　大阪 たこ焼　ダイカットキーホルダー",
            "itemDetail": "大阪 たこ焼",
            "areaName": "大阪",
            "motif": "ちいかわ",
            "prefecture": "",
            "imageUrl": "/images/大阪 たこ焼-ちいかわ.png",
            "confidence": "exact",
        }

    @pytest.mark.parametrize("entries", [[], None])
    def test_エントリが空なら空リスト(self, entries):
        assert match_items(entries, ITEMS) == []

    def test_該当なしなら空リスト(self):
        results = match_items(
            [{"character": "", "area": "スイス", "motif": "チョコ"}], ITEMS
        )
        assert results == []


class TestScoreConstants:
    def test_スコアの大小関係(self):
        assert SCORE_EXACT > SCORE_PARTIAL > SCORE_AREA
