import logging
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from area_mapping import predict_area
from scraper import fetch_items, download_image_to_s3

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

    logger.info("Starting scrape: %s", target_url)

    items = fetch_items(target_url)
    if not items:
        logger.warning("No keychain items found at %s", target_url)
        return {"statusCode": 200, "body": "No items found"}

    existing = _get_existing_item_names(table)

    added = 0
    skipped = 0

    for item in items:
        if item.item_name in existing:
            logger.info("Skip existing: %s", item.item_name)
            skipped += 1
            continue

        image_s3_key = ""
        if item.image_url_original:
            try:
                image_s3_key = download_image_to_s3(
                    item.image_url_original, item.item_name
                )
            except Exception as e:
                logger.warning("Image download failed for %s: %s", item.item_name, e)

        area_type, area_name = predict_area(item.item_name)

        image_url = f"{CLOUDFRONT_IMAGES_PREFIX}{image_s3_key}" if image_s3_key else ""

        table.put_item(
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
