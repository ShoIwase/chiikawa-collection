import logging
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from area_mapping import predict_area
from scraper import fetch_items, download_image_to_s3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MASTER_TABLE: str = os.environ["MASTER_TABLE"]
TARGET_URL: str = os.environ["TARGET_URL"]

_dynamodb = boto3.resource("dynamodb")
_table = _dynamodb.Table(MASTER_TABLE)

CLOUDFRONT_IMAGES_PREFIX = "/images/"


def lambda_handler(event: dict, context: object) -> dict:
    logger.info("Starting scrape: %s", TARGET_URL)

    items = fetch_items(TARGET_URL)
    if not items:
        logger.warning("No keychain items found at %s", TARGET_URL)
        return {"statusCode": 200, "body": "No items found"}

    # 既存アイテム名を取得（重複チェック用）
    existing = _get_existing_item_names()

    added = 0
    skipped = 0

    for item in items:
        if item.item_name in existing:
            logger.info("Skip existing: %s", item.item_name)
            skipped += 1
            continue

        # 画像を S3 にダウンロード
        image_s3_key = ""
        if item.image_url_original:
            try:
                image_s3_key = download_image_to_s3(
                    item.image_url_original, item.item_name
                )
            except Exception as e:
                logger.warning("Image download failed for %s: %s", item.item_name, e)

        # エリア予測
        area_type, area_name = predict_area(item.item_name)

        # CloudFront 経由の画像 URL (フロントエンドは /images/<key> でアクセス)
        image_url = f"{CLOUDFRONT_IMAGES_PREFIX}{image_s3_key}" if image_s3_key else ""

        _table.put_item(
            Item={
                "Category": "KeyChain",
                "ItemName": item.item_name,
                "Motif": item.motif,
                "AreaType": area_type,
                "AreaName": area_name,
                "ImageUrl": image_url,
                "IsVerified": False,
                "CreatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("Added: %s (AreaType=%s, AreaName=%s)", item.item_name, area_type, area_name)
        added += 1

    result = {"added": added, "skipped": skipped}
    logger.info("Done: %s", result)
    return {"statusCode": 200, "body": str(result)}


def _get_existing_item_names() -> set[str]:
    names: set[str] = set()
    kwargs: dict = {
        "KeyConditionExpression": Key("Category").eq("KeyChain"),
        "ProjectionExpression": "ItemName",
    }
    while True:
        resp = _table.query(**kwargs)
        for item in resp.get("Items", []):
            names.add(item["ItemName"])
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return names
