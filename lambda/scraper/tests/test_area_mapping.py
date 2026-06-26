import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from area_mapping import predict_area, PREFECTURES, HOT_SPRINGS, OVERSEAS


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
    """温泉地が都道府県より後に評価されること、主要温泉地を正しく判定できること"""

    @pytest.mark.parametrize("spring", HOT_SPRINGS)
    def test_hot_spring_detected(self, spring):
        item_name = f"{spring} ダイカットキーホルダー"
        area_type, area_name = predict_area(item_name)
        assert area_type == "温泉地"
        assert area_name == spring

    def test_hakone(self):
        area_type, area_name = predict_area("箱根 ダイカットキーホルダー")
        assert area_type == "温泉地"
        assert area_name == "箱根"

    def test_beppu(self):
        area_type, area_name = predict_area("別府 ダイカットキーホルダー")
        assert area_type == "温泉地"
        assert area_name == "別府"

    def test_kusatsu(self):
        area_type, area_name = predict_area("草津 ダイカットキーホルダー")
        assert area_type == "温泉地"
        assert area_name == "草津"


class TestOverseas:
    """海外地名を正しく判定できること"""

    @pytest.mark.parametrize("place", OVERSEAS)
    def test_overseas_detected(self, place):
        item_name = f"{place} ダイカットキーホルダー"
        area_type, area_name = predict_area(item_name)
        assert area_type == "海外"
        assert area_name == place

    def test_hongkong(self):
        area_type, area_name = predict_area("香港 ダイカットキーホルダー")
        assert area_type == "海外"
        assert area_name == "香港"

    def test_seoul(self):
        area_type, area_name = predict_area("ソウル ダイカットキーホルダー")
        assert area_type == "海外"
        assert area_name == "ソウル"


class TestFallback:
    """都道府県・温泉地・海外いずれにも該当しない場合のフォールバック"""

    def test_city_with_landmark_suffix_stripped(self):
        # "小樽運河" → suffix "運河" を除去して "小樽" を地名とする
        area_type, area_name = predict_area("小樽運河 ダイカットキーホルダー")
        assert area_type == "市町村"
        assert area_name == "小樽"

    def test_city_with_castle_suffix(self):
        area_type, area_name = predict_area("松本城 ダイカットキーホルダー")
        assert area_type == "市町村"
        assert area_name == "松本"

    def test_plain_city_name(self):
        area_type, area_name = predict_area("行徳 ダイカットキーホルダー")
        assert area_type == "市町村"
        assert area_name == "行徳"

    def test_fullwidth_space_separator(self):
        # 全角スペース区切り
        area_type, area_name = predict_area("行徳　ダイカットキーホルダー")
        assert area_type == "市町村"
        assert area_name == "行徳"

    def test_priority_prefecture_over_hotspring(self):
        # 「草津」は群馬県にあるが、温泉地として先にマッチするかを確認
        # (HOT_SPRINGS が PREFECTURES より後に評価されるので都道府県が優先)
        # 「群馬 草津 ダイカットキーホルダー」→ 都道府県: 群馬
        area_type, area_name = predict_area("群馬 草津 ダイカットキーホルダー")
        assert area_type == "都道府県"
        assert area_name == "群馬"
