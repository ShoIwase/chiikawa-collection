import logging
import os
import re
from collections import Counter
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from area_mapping import predict_area
from scraper import (
    CHIIKAWA_CHARACTERS,
    analyze_image,
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
    existing_bases = {_strip_char_suffix(n) for n in existing}

    # 同じ商品名で地域違いの別商品（例: 静岡/和歌山/愛媛の「みかん」）が存在するため、
    # 商品名の出現回数を数え、重複する商品名は地域名で一意化する。
    name_counts = Counter(item.item_name for item in items)

    added = 0
    skipped = 0

    for item in items:
        collides = name_counts[item.item_name] > 1

        # 重複しない商品で既に登録済みなら、画像取得・解析を省略（日次差分の効率化）。
        # 重複する商品は地域名で分かれるため、毎回解析して全地域分を確実に揃える。
        if not collides and item.item_name in existing_bases:
            logger.info("Skip existing (base name): %s", item.item_name)
            skipped += 1
            continue

        # 画像をダウンロード（バイト列のみ。S3アップロードは一意な名前確定後に行う）
        image_data = b""
        content_type = "image/jpeg"
        if item.image_url_original:
            try:
                image_data, content_type = fetch_image_from_url(item.image_url_original)
            except Exception as e:
                logger.warning("Image download failed for %s: %s", item.item_name, e)

        # Claude で画像からキャラクターと地域を検出
        characters: list[str] = []
        region = ""
        if image_data:
            try:
                analysis = analyze_image(image_data, content_type)
                characters = analysis["characters"]
                region = analysis["region"]
            except Exception as e:
                logger.warning("Image analysis failed for %s: %s", item.item_name, e)

        # 検出失敗時は名前ベースの推測にフォールバック
        if not characters:
            characters = [item.motif]

        # 重複する商品名は地域名（無ければ画像ID）を前置して一意化する。
        # 同名商品は S3 キーも衝突するため、この一意化名を画像名にも使う。
        base_name = item.item_name
        if collides:
            disambiguator = region or _image_id(item.image_url_original)
            if disambiguator:
                base_name = f"{disambiguator}　{item.item_name}"

        # 一意化した名前で S3 にアップロード（同名商品の画像上書きを防ぐ）
        image_s3_key = ""
        if image_data:
            try:
                image_s3_key = upload_image_to_s3(image_data, base_name, content_type)
            except Exception as e:
                logger.warning("Image upload failed for %s: %s", base_name, e)

        image_url = f"{CLOUDFRONT_IMAGES_PREFIX}{image_s3_key}" if image_s3_key else ""
        # エリアは画像から取れた地域を優先、無ければ商品名から推測
        if region:
            area_type, area_name = predict_area(region)
        else:
            area_type, area_name = predict_area(item.item_name)

        for character in characters:
            entry_name = _make_entry_name(base_name, character)

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


def _strip_char_suffix(name: str) -> str:
    """ItemName 末尾のキャラクター名を除去して基底の商品名を得る。"""
    for character in CHIIKAWA_CHARACTERS:
        for sep in (" ", "　"):
            suffix = f"{sep}{character}"
            if name.endswith(suffix):
                return name[: -len(suffix)]
    return name


def _image_id(image_url: str) -> str:
    """画像URLから数値ID（例: tphoto_550210_0_b.png → 550210）を抽出する。"""
    m = re.search(r"(\d{4,})", image_url or "")
    return m.group(1) if m else ""


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
