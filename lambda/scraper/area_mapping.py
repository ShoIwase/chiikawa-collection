import re

PREFECTURES: list[str] = [
    "北海道",
    "青森", "岩手", "宮城", "秋田", "山形", "福島",
    "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
    "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜",
    "静岡", "愛知", "三重",
    "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
    "鳥取", "島根", "岡山", "広島", "山口",
    "徳島", "香川", "愛媛", "高知",
    "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄",
]

# 温泉地・観光地（都道府県名より先にマッチさせたいものを前に）
HOT_SPRINGS: list[str] = [
    "箱根", "熱海", "別府", "湯布院", "由布院", "草津", "鬼怒川",
    "有馬", "登別", "城崎", "白浜", "指宿", "下呂", "道後",
    "伊東", "修善寺", "蔵王", "乳頭", "黒川", "野沢", "那須",
    "嬉野", "雲仙", "阿蘇", "十勝", "富良野", "層雲峡",
]

OVERSEAS: list[str] = [
    "香港", "ソウル", "釜山", "台湾", "台北", "高雄",
    "パリ", "ロンドン", "ローマ", "ミラノ", "バルセロナ", "プラハ",
    "ニューヨーク", "ロサンゼルス", "ハワイ", "グアム", "サイパン",
    "バンコク", "シンガポール", "バリ", "クアラルンプール",
    "上海", "北京", "成都", "マカオ",
]

# 地名から除去する一般的なサフィックス（AreaName の精度向上）
_SUFFIXES = re.compile(
    r"(運河|城|港|山|湖|川|駅|寺|神社|公園|海岸|岬|峠|温泉|高原|牧場|スキー場|リゾート|マリン)$"
)


def _full_pref(short: str) -> str:
    """都道府県の短縮名を正式名に変換する（千葉→千葉県、東京→東京都 など）。"""
    if short == "北海道":
        return "北海道"
    if short == "東京":
        return "東京都"
    if short in ("大阪", "京都"):
        return short + "府"
    return short + "県"


# 正式名（千葉県 等）の一覧。フロントのドロップダウン順序にも使う。
PREFECTURES_FULL: list[str] = [_full_pref(p) for p in PREFECTURES]

# 市区町村・観光地名 → 親の都道府県（正式名）。画像から県が取れない時のフォールバック。
CITY_TO_PREF: dict[str, str] = {
    # 北海道
    "函館": "北海道", "札幌": "北海道", "小樽": "北海道", "富良野": "北海道", "十勝": "北海道",
    # 東北・関東
    "日光": "栃木県", "足利": "栃木県", "那須": "栃木県",
    "草津": "群馬県", "鬼怒川": "栃木県",
    "市川市": "千葉県", "市川": "千葉県", "行徳": "千葉県",
    "横浜": "神奈川県", "箱根": "神奈川県", "鎌倉": "神奈川県",
    # 中部
    "清水": "静岡県", "熱海": "静岡県", "伊東": "静岡県", "修善寺": "静岡県",
    "飛騨": "岐阜県", "下呂": "岐阜県",
    "信州": "長野県", "野沢": "長野県",
    "名古屋": "愛知県",
    # 近畿
    "京都": "京都府", "金閣寺": "京都府",
    "神戸": "兵庫県", "姫路": "兵庫県", "淡路": "兵庫県", "有馬": "兵庫県", "城崎": "兵庫県",
    "白浜": "和歌山県",
    # 中国・四国
    "宮島": "広島県", "尾道": "広島県",
    "鳴門": "徳島県", "道後": "愛媛県",
    # 九州・沖縄
    "北九州": "福岡県", "別府": "大分県", "湯布院": "大分県", "由布院": "大分県",
    "嬉野": "佐賀県", "雲仙": "長崎県", "阿蘇": "熊本県", "黒川": "熊本県", "指宿": "鹿児島県",
    "奄美": "鹿児島県",
}


def normalize_prefecture(name: str) -> str:
    """任意の地名文字列を都道府県の正式名に正規化する。県でなければ空文字。"""
    name = (name or "").strip()
    if not name:
        return ""
    if name in PREFECTURES_FULL:
        return name
    if name in PREFECTURES:
        return _full_pref(name)
    # "千葉県市川市" のように県名を含む場合
    for p in PREFECTURES:
        if p in name:
            return _full_pref(p)
    return ""


def resolve_prefecture(area_name: str, bedrock_prefecture: str = "") -> str:
    """商品の所属都道府県（正式名）を決める。判定できなければ空文字（=その他扱い）。

    優先順位: 1) 画像/モデルが返した県名 2) AreaName 自体が県 3) 市区町村→親県ルックアップ
    """
    pref = normalize_prefecture(bedrock_prefecture)
    if pref:
        return pref
    pref = normalize_prefecture(area_name)
    if pref:
        return pref
    return CITY_TO_PREF.get((area_name or "").strip(), "")


AREA_TYPES = ("都道府県", "市区町村", "その他")


def predict_area(item_name: str) -> tuple[str, str]:
    """
    商品名からエリア種別とエリア名を予測する（画像から地域が取れない時のフォールバック）。
    エリア種別は 都道府県 / 市区町村 / その他 の3分類。
    """
    # 都道府県（完全一致優先）
    for pref in PREFECTURES:
        if pref in item_name:
            return ("都道府県", pref)

    # 海外は「その他」
    for place in OVERSEAS:
        if place in item_name:
            return ("その他", place)

    # 温泉地・観光地は実在の市区町村（箱根町・別府市など）として扱う
    for spring in HOT_SPRINGS:
        if spring in item_name:
            return ("市区町村", spring)

    # フォールバック: 最初のスペース/全角スペース区切りの最初のトークンを地名と推定
    first_token = re.split(r"[\s　　]", item_name)[0]
    area_name = _SUFFIXES.sub("", first_token) or first_token
    return ("市区町村", area_name)


def classify_area(region: str, area_type_hint: str = "") -> tuple[str, str]:
    """画像から抽出した地域名(region)とモデルのエリア種別ヒントから (AreaType, AreaName) を返す。

    - 都道府県は PREFECTURES リストで決定的に判定（ヒントより優先）
    - 海外は OVERSEAS リストで「その他」に固定（モデル誤分類のガード）
    - 市区町村 / その他 はモデルのヒントを採用
    - ヒントが都道府県だが県リスト外なら「その他」に降格（関西・東海などの広域対策）
    """
    region = (region or "").strip()
    if not region:
        return ("その他", "")

    for pref in PREFECTURES:
        if pref in region:
            return ("都道府県", pref)

    for place in OVERSEAS:
        if place in region:
            return ("その他", region)

    if area_type_hint in AREA_TYPES:
        if area_type_hint == "都道府県":
            # 県リストに無い「都道府県」判定は広域名などの可能性が高いため降格
            return ("その他", region)
        return (area_type_hint, region)

    return ("その他", region)
