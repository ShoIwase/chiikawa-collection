import base64
import json
import logging
import os
import re

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_MASTER_TABLE = os.environ.get("MASTER_TABLE", "ChiikawaMaster")
_BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID",
    "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
)
_CATEGORY = "KeyChain"

_bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")
_dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")


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


def _extract_areas_from_image(image_bytes: bytes, mime_type: str) -> list[str]:
    """Bedrockでユーザー写真からご当地名リストを抽出する。"""
    fmt = mime_type.split(";")[0].strip().split("/")[-1]
    if fmt not in {"jpeg", "png", "gif", "webp"}:
        fmt = "jpeg"

    prompt = """
    あなたは画像内の商品タグ文字を慎重に読み取るOCR補助AIです。

    画像には「ご当地ちいかわダイカットキーホルダー」が複数写っています。
    各キーホルダーについて、タグ・台紙・本体に印字された
    地域名・地名・観光地名・ご当地モチーフ名を読み取ってください。

    # 読み取り対象
    - 都道府県名
    - 市区町村名
    - 地域名
    - 観光地名
    - ご当地モチーフ名
    - 例: 北海道, 沖縄, 東京 パンダ, 大阪 たこ焼, 京都 抹茶

    # 除外する語
    以下の商品共通語・装飾語は出力しないでください。
    - ご当地
    - 限定
    - ちいかわ
    - ダイカット
    - キーホルダー
    - キーチェーン
    - マスコット
    - 根付
    - ストラップ
    - かわいい
    - キャラクター名のみ

    # 重要ルール
    - 画像内で実際に読める文字だけを出力してください。
    - 推測で補完しないでください。
    - 判読できないものは出力しないでください。
    - 一部しか読めない場合も、意味が確実に分かる場合だけ出力してください。
    - 同じ名称が複数回写っていても、JSON配列内では1回だけ出力してください。
    - 表記は画像内の文字を優先してください。
    - 地名とモチーフが両方読める場合は、半角スペースでつなげてください。
    例: "大阪 たこ焼"
    - 地名だけ読める場合は地名のみ出力してください。
    例: "北海道"

    # 出力形式
    JSON配列のみを出力してください。
    説明文、Markdown、コードブロック、前置き、後書きは一切出力しないでください。

    # 出力例
    ["北海道", "沖縄", "東京 パンダ", "大阪 たこ焼"]
    """

    response = _bedrock.converse(
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
                {"text": prompt},
            ],
        }],
        inferenceConfig={"maxTokens": 500},
    )
    text = response["output"]["message"]["content"][0]["text"].strip()

    # ```json ... ``` フェンスを除去してから配列抽出
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        logger.warning("No JSON array in response: %s", text)
        return []
    try:
        areas = json.loads(match.group(0))
        return [str(a).strip() for a in areas if isinstance(a, str) and a.strip()]
    except json.JSONDecodeError:
        logger.warning("Failed to parse areas: %s", text)
        return []


def _find_items_by_areas(areas: list[str]) -> list[dict]:
    """ChiikawaMaster から AreaName が一致するアイテムを返す。"""
    if not areas:
        return []

    table = _dynamodb.Table(_MASTER_TABLE)

    # Scan して全アイテムを取得、AreaName でフィルタ（件数が多くないため許容）
    result = table.scan(
        FilterExpression=Attr("Category").eq(_CATEGORY),
        ProjectionExpression="ItemName, AreaName, Motif, Prefecture",
    )
    all_items = result.get("Items", [])

    # 大文字小文字・空白を正規化して比較
    def normalize(s: str) -> str:
        return s.strip().lower().replace("　", " ").replace("　", " ")

    area_set = {normalize(a) for a in areas}

    matched: list[dict] = []
    for item in all_items:
        if normalize(item.get("AreaName", "")) in area_set:
            matched.append({
                "itemName": item["ItemName"],
                "areaName": item.get("AreaName", ""),
                "motif": item.get("Motif", ""),
                "prefecture": item.get("Prefecture", ""),
            })

    return matched


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

        areas = _extract_areas_from_image(image_bytes, mime_type)
        logger.info("Extracted areas: %s", areas)

        matched = _find_items_by_areas(areas)
        logger.info("Matched %d items for areas %s", len(matched), areas)

        return _ok({"areas": areas, "matched": matched})

    except Exception as e:
        logger.exception("Unhandled error")
        return _err(500, str(e))
