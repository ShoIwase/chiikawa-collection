import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from area_mapping import predict_area, classify_area, PREFECTURES, HOT_SPRINGS, OVERSEAS


class TestPrefectures:
    """47都道府県すべてを正しく判定できること"""

    @pytest.mark.parametrize("pref", PREFECTURES)
    def test_prefecture_detected(self, pref):
        item_name = f"{pref} ダイカットキーホルダー"
        area_type, area_name = predict_area(item_name)
        assert area_type == "都道府県"
        assert area_name == pref

    def test_hokkaido(self):
        area_type, area_name = predict_area("北海道 ダイカットキーホルダー")
        assert area_type == "都道府県"
        assert area_name == "北海道"

    def test_tokyo(self):
        area_type, area_name = predict_area("東京 ダイカットキーホルダー")
        assert area_type == "都道府県"
        assert area_name == "東京"

    def test_okinawa(self):
        area_type, area_name = predict_area("沖縄 ダイカットキーホルダー")
        assert area_type == "都道府県"
        assert area_name == "沖縄"


class TestHotSprings:
    """温泉地は実在の市区町村として扱うこと（箱根町・別府市など）"""

    @pytest.mark.parametrize("spring", HOT_SPRINGS)
    def test_hot_spring_detected(self, spring):
        item_name = f"{spring} ダイカットキーホルダー"
        area_type, area_name = predict_area(item_name)
        assert area_type == "市区町村"
        assert area_name == spring

    def test_hakone(self):
        area_type, area_name = predict_area("箱根 ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "箱根"

    def test_beppu(self):
        area_type, area_name = predict_area("別府 ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "別府"


class TestOverseas:
    """海外地名は「その他」に分類されること"""

    @pytest.mark.parametrize("place", OVERSEAS)
    def test_overseas_detected(self, place):
        item_name = f"{place} ダイカットキーホルダー"
        area_type, area_name = predict_area(item_name)
        assert area_type == "その他"
        assert area_name == place

    def test_hongkong(self):
        area_type, area_name = predict_area("香港 ダイカットキーホルダー")
        assert area_type == "その他"
        assert area_name == "香港"

    def test_seoul(self):
        area_type, area_name = predict_area("ソウル ダイカットキーホルダー")
        assert area_type == "その他"
        assert area_name == "ソウル"


class TestFallback:
    """都道府県・海外・温泉地いずれにも該当しない場合のフォールバック（市区町村）"""

    def test_city_with_landmark_suffix_stripped(self):
        # "小樽運河" → suffix "運河" を除去して "小樽" を地名とする
        area_type, area_name = predict_area("小樽運河 ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "小樽"

    def test_city_with_castle_suffix(self):
        area_type, area_name = predict_area("松本城 ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "松本"

    def test_plain_city_name(self):
        area_type, area_name = predict_area("行徳 ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "行徳"

    def test_fullwidth_space_separator(self):
        # 全角スペース区切り
        area_type, area_name = predict_area("行徳　ダイカットキーホルダー")
        assert area_type == "市区町村"
        assert area_name == "行徳"

    def test_priority_prefecture_over_hotspring(self):
        # 「群馬 草津」→ 都道府県が温泉地より優先され「群馬」
        area_type, area_name = predict_area("群馬 草津 ダイカットキーホルダー")
        assert area_type == "都道府県"
        assert area_name == "群馬"


class TestClassifyArea:
    """画像から取れた region + モデルヒントによる分類"""

    def test_prefecture_deterministic(self):
        # 都道府県はリストで決定的に判定（ヒントに依らない）
        assert classify_area("静岡", "市区町村") == ("都道府県", "静岡")
        assert classify_area("奈良", "") == ("都道府県", "奈良")

    def test_overseas_forced_other(self):
        # 海外はヒストが何であれ「その他」
        assert classify_area("香港", "市区町村") == ("その他", "香港")

    def test_city_hint_honored(self):
        # 県リスト外で市区町村ヒント → 市区町村
        assert classify_area("鎌倉", "市区町村") == ("市区町村", "鎌倉")

    def test_region_hint_demoted_to_other(self):
        # 広域名を都道府県と誤判定 → その他に降格
        assert classify_area("関西", "都道府県") == ("その他", "関西")

    def test_other_hint(self):
        assert classify_area("リゾート", "その他") == ("その他", "リゾート")

    def test_empty_region(self):
        assert classify_area("", "都道府県") == ("その他", "")

    def test_no_hint_defaults_other(self):
        # 県外・海外外でヒント無し → その他
        assert classify_area("どこか", "") == ("その他", "どこか")
