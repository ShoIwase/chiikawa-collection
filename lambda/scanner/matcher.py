"""ユーザー写真から抽出した認識結果と ChiikawaMaster のアイテムを照合する。

AWS に依存しない純粋関数のみで構成し、テストからそのまま呼べるようにしている。
"""

import re
import unicodedata

KEYCHAIN_KEYWORD = "ダイカットキーホルダー"
CHARACTERS: tuple[str, ...] = ("ちいかわ", "ハチワレ", "うさぎ")

# スコア（大きいほど確度が高い）
SCORE_EXACT = 3
SCORE_PARTIAL = 2
SCORE_AREA = 1

_CONFIDENCE = {SCORE_EXACT: "exact", SCORE_PARTIAL: "partial", SCORE_AREA: "area"}

# 部分一致とみなす Dice 係数のしきい値
_DICE_THRESHOLD = 0.5

_KEYCHAIN_TAIL = re.compile(rf"[\s　]*{KEYCHAIN_KEYWORD}$")


def normalize(s: str) -> str:
    """全角/半角・大小文字・空白の揺れを吸収する。

    NFKC で全角英数と半角カナを統一し、空白は全除去する。
    「大阪 たこ焼」と「大阪たこ焼」を同一視したいので空白は残さない。
    """
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"\s+", "", s)
    return s.lower()


def item_core(item_name: str, motif: str = "") -> str:
    """ItemName から商品名コアを取り出す。

    `{キャラ}　{商品名}　ダイカットキーホルダー` の逆変換。
    キャラ名は DB の Motif 属性を優先し、無ければ既知のキャラ名で剥がす。
    `{キャラ}　ダイカットキーホルダー` のように商品名が無い場合は "" を返す。

    NOTE: フロントの frontend/src/lib/format.ts splitItemDisplay() と対のロジック。
    命名規約を変えるときは両方直すこと。
    """
    core = _KEYCHAIN_TAIL.sub("", item_name or "")
    heads = ([motif] if motif else []) + list(CHARACTERS)
    for head in heads:
        if head and core.startswith(head):
            core = core[len(head):]
            break
    return core.strip()


def extract_areas(text: str, known_areas) -> list[str]:
    """認識テキストに含まれる AreaName を左から最長一致で抽出する。

    各位置で最長の地名を取ることで、「東京都」が「京都」に誤マッチするのを防ぐ
    （東京都 → 先頭で「東京」が取れ、残りは「都」なので「京都」は成立しない）。
    「大阪府」のような正式名も、「大阪」を取った時点で府が余るだけなので自然に吸収される。
    """
    hay = normalize(text)
    if not hay:
        return []

    # 正規化した地名 → 元の表記
    norm_map: dict[str, str] = {}
    for area in known_areas:
        key = normalize(area)
        if key:
            norm_map.setdefault(key, area)
    if not norm_map:
        return []

    max_len = max(len(k) for k in norm_map)
    found: list[str] = []
    i = 0
    while i < len(hay):
        for length in range(min(max_len, len(hay) - i), 0, -1):
            hit = norm_map.get(hay[i:i + length])
            if hit is not None:
                found.append(hit)
                i += length
                break
        else:
            i += 1
    return dedupe(found)


def dedupe(values: list[str]) -> list[str]:
    """出現順を保ったまま重複を除く。"""
    seen = set()
    out = []
    for v in values:
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _bigrams(s: str) -> set[str]:
    if len(s) < 2:
        return {s} if s else set()
    return {s[i:i + 2] for i in range(len(s) - 1)}


def dice(a: str, b: str) -> float:
    """文字 bigram の Dice 係数（表記ゆれ吸収用）。"""
    ba, bb = _bigrams(a), _bigrams(b)
    if not ba or not bb:
        return 0.0
    return 2 * len(ba & bb) / (len(ba) + len(bb))


def _score(motif_n: str, core_n: str, area_n: str) -> int:
    """認識モチーフとアイテムのコアを比較してスコアを返す。"""
    # コアから地域名を除いた残り（「大阪たこ焼」→「たこ焼」）
    remainder = core_n.replace(area_n, "", 1) if area_n else core_n

    if not motif_n:
        # モチーフが読めていない場合、コアが地名そのものなら確定とみなす（例: 北海道）
        return SCORE_EXACT if core_n and core_n == area_n else SCORE_AREA

    if motif_n in core_n:
        return SCORE_EXACT
    if remainder and motif_n == remainder:
        return SCORE_EXACT
    if remainder and dice(motif_n, remainder) >= _DICE_THRESHOLD:
        return SCORE_PARTIAL
    if dice(motif_n, core_n) >= _DICE_THRESHOLD:
        return SCORE_PARTIAL
    return SCORE_AREA


def _prepare(items) -> list[dict]:
    """DB アイテムに正規化済みのコア・地域名を持たせる。"""
    prepared = []
    for item in items:
        core = item_core(item.get("ItemName", ""), item.get("Motif", ""))
        prepared.append({
            "raw": item,
            "core": core,
            "core_n": normalize(core),
            "area_n": normalize(item.get("AreaName", "")),
        })
    return prepared


def _to_result(prepared: dict, score: int) -> dict:
    item = prepared["raw"]
    return {
        "itemName": item.get("ItemName", ""),
        "itemDetail": prepared["core"],
        "areaName": item.get("AreaName", ""),
        "motif": item.get("Motif", ""),
        "prefecture": item.get("Prefecture", ""),
        "imageUrl": item.get("ImageUrl", ""),
        "confidence": _CONFIDENCE[score],
    }


def _match_one(entry: dict, prepared: list[dict], known_areas) -> list[tuple[dict, int]]:
    """認識エントリ1件に該当するアイテムを (prepared, score) で返す。"""
    area_raw = (entry.get("area") or "").strip()
    motif_raw = (entry.get("motif") or "").strip()
    character = (entry.get("character") or "").strip()

    # 地名とモチーフが不可分な商品（大阪城 等）に備えて両方を走査対象にする
    areas = extract_areas(f"{area_raw} {motif_raw}", known_areas)
    motif_n = normalize(motif_raw)

    if areas:
        area_set = {normalize(a) for a in areas}
        gated = [p for p in prepared if p["area_n"] in area_set]
    elif motif_n:
        # 地域が読めなかった場合は、モチーフの完全包含だけを頼りに救済する
        gated = [p for p in prepared if p["core_n"] and motif_n in p["core_n"]]
        if not gated:
            return []
        return [(p, SCORE_EXACT) for p in _narrow_by_character(gated, character)]
    else:
        return []

    if not gated:
        return []

    scored = [(p, _score(motif_n, p["core_n"], p["area_n"])) for p in gated]

    # スコア2以上のコアがあれば、最良のコアだけに絞る（1商品=3キャラ）
    best = max(score for _, score in scored)
    if best >= SCORE_PARTIAL:
        best_cores = {p["core_n"] for p, score in scored if score == best}
        scored = [(p, score) for p, score in scored if p["core_n"] in best_cores]
        picked = _narrow_by_character([p for p, _ in scored], character)
        picked_names = {id(p) for p in picked}
        return [(p, score) for p, score in scored if id(p) in picked_names]

    # 該当商品を特定できないので、その地域の候補をまとめて返す
    return [(p, SCORE_AREA) for p in gated]


def _narrow_by_character(candidates: list[dict], character: str) -> list[dict]:
    """キャラが読めていればそのキャラだけに絞る。

    該当が1件も無ければ誤認識とみなして絞らない（0件になるのを防ぐ）。
    """
    if not character:
        return candidates
    hit = [p for p in candidates if p["raw"].get("Motif", "") == character]
    return hit or candidates


def match_items(entries, items) -> list[dict]:
    """認識エントリ列と DB アイテム列を照合して、該当アイテムを返す。

    entries: [{"character": str, "area": str, "motif": str}, ...]
    items:   ChiikawaMaster の項目（ItemName / AreaName / Motif / Prefecture / ImageUrl）
    """
    if not entries or not items:
        return []

    prepared = _prepare(items)
    known_areas = dedupe([i.get("AreaName", "") for i in items if i.get("AreaName")])

    # 同じアイテムが複数エントリから来たら、最も確度の高いスコアを残す
    best_by_name: dict[str, tuple[dict, int]] = {}
    for entry in entries:
        for p, score in _match_one(entry, prepared, known_areas):
            name = p["raw"].get("ItemName", "")
            current = best_by_name.get(name)
            if current is None or score > current[1]:
                best_by_name[name] = (p, score)

    return [_to_result(p, score) for p, score in best_by_name.values()]
