import base64
import json
import logging
import os
import re

import boto3
from boto3.dynamodb.conditions import Attr

import matcher

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_MASTER_TABLE = os.environ.get("MASTER_TABLE", "ChiikawaMaster")
_BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID",
    "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
)
_CATEGORY = "KeyChain"

# クライアントは遅延生成する（import 時に AWS 認証を要求しないため。テストからも差し替えやすい）
_bedrock = None
_dynamodb = None


def _get_bedrock():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")
    return _bedrock


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
    return _dynamodb.Table(_MASTER_TABLE)


def _ok(body: dict) -> dict:
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _err(status: int, msg: str) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": msg}, ensure_ascii=False),
    }


PROMPT = """
あなたは画像内の商品タグ文字を慎重に読み取るOCR補助AIです。

画像には「ご当地ちいかわダイカットキーホルダー」が複数写っています。
各キーホルダーについて、キャラクター・地域名・ご当地モチーフを読み取ってください。

# 読み取る項目
- character: ちいかわ / ハチワレ / うさぎ のいずれか。
  ちいかわ=白い丸顔、ハチワレ=青と白の猫のような見た目、うさぎ=黄色くて耳が長い。
  判別できない場合は空文字にしてください。
- area: 地域名のみ（都道府県名・市区町村名・観光地名・国名）。
  例: 北海道, 大阪, 京都, 沖縄
- motif: 地域名を除いたご当地要素。
  例: たこ焼, 抹茶ソフト, パンダ, シマエナガ

# 重要ルール
- 画像内で実際に読める文字だけを出力してください。
- 推測で補完しないでください。判読できないものは出力しないでください。
- 地域名とモチーフが分離できない一体の名称（例: 大阪城, 大阪のおばちゃん,
  ニデック京都タワー）は、area を空文字にして motif に名称全体を入れてください。
- 地域名しか読めない場合は motif を空文字にしてください。
- 商品共通語（ご当地／限定／ダイカット／キーホルダー／マスコット／ストラップ）は
  出力しないでください。
- 同じ商品が複数写っていても、JSON配列内では1回だけ出力してください。

# 出力形式
JSON配列のみを出力してください。
説明文、Markdown、コードブロック、前置き、後書きは一切出力しないでください。

# 出力例
[
  {"character": "ハチワレ", "area": "大阪", "motif": "たこ焼"},
  {"character": "", "area": "北海道", "motif": ""},
  {"character": "うさぎ", "area": "", "motif": "大阪城"}
]
"""


def _coerce_entry(value) -> dict | None:
    """モデル出力の1要素を {character, area, motif} に正規化する。"""
    if isinstance(value, dict):
        entry = {
            "character": str(value.get("character") or "").strip(),
            "area": str(value.get("area") or "").strip(),
            "motif": str(value.get("motif") or "").strip(),
        }
        return entry if entry["area"] or entry["motif"] else None
    # 旧形式（"大阪 たこ焼" のような文字列配列）への後方互換。
    # 地名とモチーフの境界が不明なので、まるごと motif に入れてマッチャに判定させる。
    if isinstance(value, str) and value.strip():
        return {"character": "", "area": "", "motif": value.strip()}
    return None


def _parse_entries(text: str) -> list[dict]:
    """モデル応答から認識エントリ列を取り出す。

    ```json``` フェンスや前後の説明文が混ざっても拾えるようにし、
    maxTokens 超過で配列が閉じなかった場合も完結したオブジェクトだけ回収する。
    """
    raw_items = None

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                raw_items = parsed
        except json.JSONDecodeError:
            logger.warning("Failed to parse JSON array, falling back to salvage")

    if raw_items is None:
        # 配列が閉じていない場合でも、完結している JSON オブジェクトだけは救い出す
        salvaged = []
        for obj in re.finditer(r"\{[^{}]*\}", text, re.DOTALL):
            try:
                salvaged.append(json.loads(obj.group(0)))
            except json.JSONDecodeError:
                continue
        if not salvaged:
            logger.warning("No parsable entries in response: %s", text[:500])
            return []
        raw_items = salvaged

    entries = []
    for value in raw_items:
        entry = _coerce_entry(value)
        if entry:
            entries.append(entry)
    return entries


def _extract_entries_from_image(image_bytes: bytes, mime_type: str) -> list[dict]:
    """Bedrockでユーザー写真からキャラ・地域・モチーフを抽出する。"""
    fmt = mime_type.split(";")[0].strip().split("/")[-1]
    if fmt not in {"jpeg", "png", "gif", "webp"}:
        fmt = "jpeg"

    response = _get_bedrock().converse(
        modelId=_BEDROCK_MODEL_ID,
        messages=[{
            "role": "user",
            "content": [
                {
                    "image": {
                        "format": fmt,
                        "source": {"bytes": image_bytes},
                    },
                },
                {"text": PROMPT},
            ],
        }],
        # OCR は決定的であるべきなので temperature=0。
        # maxTokens は打ち切られると JSON が閉じず全件ロストするため余裕を持たせる。
        inferenceConfig={"maxTokens": 2000, "temperature": 0},
    )

    if response.get("stopReason") == "max_tokens":
        logger.warning("Bedrock response hit max_tokens; entries may be truncated")

    text = response["output"]["message"]["content"][0]["text"].strip()
    return _parse_entries(text)


def _find_items(entries: list[dict]) -> list[dict]:
    """ChiikawaMaster から認識エントリに該当するアイテムを返す。"""
    if not entries:
        return []

    # 件数が多くないため Scan で全件取得して照合する（447件・約90KBで1MB上限に余裕あり）。
    # 3000件を超えるようならページネーションを検討すること。
    result = _get_table().scan(
        FilterExpression=Attr("Category").eq(_CATEGORY),
        ProjectionExpression="ItemName, AreaName, Motif, Prefecture, ImageUrl",
    )
    return matcher.match_items(entries, result.get("Items", []))


def lambda_handler(event: dict, context) -> dict:
    try:
        raw_body = event.get("body") or ""
        if event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")

        body = json.loads(raw_body)
        image_b64: str = body.get("image", "")
        mime_type: str = body.get("mimeType", "image/jpeg")

        if not image_b64:
            return _err(400, "image is required")

        image_bytes = base64.b64decode(image_b64)
        logger.info("Received image: %d bytes, type=%s", len(image_bytes), mime_type)

        # 抽出結果とマッチ結果は必ず別々にログする（0件時の切り分けのため）
        entries = _extract_entries_from_image(image_bytes, mime_type)
        logger.info("Extracted entries: %s", json.dumps(entries, ensure_ascii=False))

        matched = _find_items(entries)
        logger.info("Matched %d items from %d entries", len(matched), len(entries))

        # areas は「モデルが何を読み取れたか」の表示用。地名とモチーフが一体の商品
        # （大阪城 等）は area が空なので、その場合は motif を代表名として使う。
        areas = matcher.dedupe(
            [e["area"] or e["motif"] for e in entries if e["area"] or e["motif"]]
        )
        return _ok({"areas": areas, "entries": entries, "matched": matched})

    except Exception as e:
        logger.exception("Unhandled error")
        return _err(500, str(e))
