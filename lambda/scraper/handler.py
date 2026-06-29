import logging
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from area_mapping import predict_area
from scraper import (
    CHIIKAWA_CHARACTERS,
    detect_characters,
    fetch_image_from_url,
    upload_image_to_s3,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CLOUDFRONT_IMAGES_PREFIX = "/"


def lambda_handler(event: dict, context: object) -> dict:
    # モジュールレベルでの boto3 初期化を避け、テスト時に moto が確実に有効な状態で初期化する
    master_table = os.environ["MASTER_TABLE"]
    target_url = os.environ["TARGET_URL"]
    region = os.environ.get("AWS_REGION", "ap-northeast-1")

    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(master_table)

    # インポートをここで行うことで、moto が有効な状態でスクレイパーモジュールを使う
    from scraper import fetch_items

    logger.info("Starting scrape: %s", target_url)

    items = fetch_items(target_url)
    if not items:
        logger.warning("No keychain items found at %s", target_url)
        return {"statusCode": 200, "body": "No items found"}

    existing = _get_existing_item_names(table)

    added = 0
    skipped = 0

    for item in items:
        # 旧形式（キャラクターなし）のまま登録済みのアイテムはスキップ（後方互換）
        if item.item_name in existing:
            logger.info("Skip existing (base name): %s", item.item_name)
            skipped += 1
            continue

        # 画像をダウンロード
        image_data = b""
        content_type = "image/jpeg"
        image_s3_key = ""
        if item.image_url_original:
            try:
                image_data, content_type = fetch_image_from_url(item.image_url_original)
                image_s3_key = upload_image_to_s3(image_data, item.item_name, content_type)
            except Exception as e:
                logger.warning("Image download failed for %s: %s", item.item_name, e)

        # Claude で画像からキャラクターを検出
        characters: list[str] = []
        if image_data:
            try:
                characters = detect_characters(image_data, content_type)
            except Exception as e:
                logger.warning("Character detection failed for %s: %s", item.item_name, e)

        # 検出失敗時は名前ベースの推測にフォールバック
        if not characters:
            characters = [item.motif]

        image_url = f"{CLOUDFRONT_IMAGES_PREFIX}{image_s3_key}" if image_s3_key else ""
        area_type, area_name = predict_area(item.item_name)

        for character in characters:
            entry_name = _make_entry_name(item.item_name, character)

            if entry_name in existing:
                logger.info("Skip existing: %s", entry_name)
                skipped += 1
                continue

            table.put_item(
                Item={
                    "Category": "KeyChain",
                    "ItemName": entry_name,
                    "Motif": character,
                    "AreaType": area_type,
                    "AreaName": area_name,
                    "ImageUrl": image_url,
                    "IsVerified": False,
                    "CreatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            existing.add(entry_name)
            logger.info(
                "Added: %s (Motif=%s, AreaType=%s, AreaName=%s)",
                entry_name, character, area_type, area_name,
            )
            added += 1

    result = {"added": added, "skipped": skipped}
    logger.info("Done: %s", result)
    return {"statusCode": 200, "body": str(result)}


def _make_entry_name(base_name: str, character: str) -> str:
    """商品名にキャラクターが含まれていればそのまま、なければ末尾に追加。"""
    if character in base_name:
        return base_name
    return f"{base_name} {character}"


def _get_existing_item_names(table) -> set[str]:
    names: set[str] = set()
    kwargs: dict = {
        "KeyConditionExpression": Key("Category").eq("KeyChain"),
        "ProjectionExpression": "ItemName",
    }
    while True:
        resp = table.query(**kwargs)
        for item in resp.get("Items", []):
            names.add(item["ItemName"])
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return names
