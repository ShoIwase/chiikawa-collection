import logging
import os
import re
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from area_mapping import classify_area, predict_area
from scraper import (
    KEYCHAIN_KEYWORD,
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
    region_name = os.environ.get("AWS_REGION", "ap-northeast-1")

    dynamodb = boto3.resource("dynamodb", region_name=region_name)
    table = dynamodb.Table(master_table)

    # インポートをここで行うことで、moto が有効な状態でスクレイパーモジュールを使う
    from scraper import fetch_items

    logger.info("Starting scrape: %s", target_url)

    items = fetch_items(target_url)
    if not items:
        logger.warning("No keychain items found at %s", target_url)
        return {"statusCode": 200, "body": "No items found"}

    existing = _get_existing_item_names(table)
    existing_image_ids = _get_existing_image_ids(table)

    added = 0
    skipped = 0

    for item in items:
        image_id = _image_id(item.image_url_original)

        # 既に取り込み済みの商品（画像IDが既出）は丸ごとスキップ（日次差分の効率化）。
        # 画像ID単位なので地域解析を再実行せずに済み、手動タグも保全される。
        if image_id and image_id in existing_image_ids:
            logger.info("Skip existing (image id %s): %s", image_id, item.item_name)
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

        # Claude で画像からキャラクター・地域・エリア種別を検出
        characters: list[str] = []
        region = ""
        area_hint = ""
        if image_data:
            try:
                analysis = analyze_image(image_data, content_type)
                characters = analysis["characters"]
                region = analysis["region"]
                area_hint = analysis["areaType"]
            except Exception as e:
                logger.warning("Image analysis failed for %s: %s", item.item_name, e)

        # 検出失敗時は名前ベースの推測にフォールバック
        if not characters:
            characters = [item.motif]

        # 「地域 モチーフ」の中核部分を組み立てる（命名・タグ共通）。地域が常に入るため一意。
        motif_part = _strip_keychain_keyword(item.item_name)
        core = _compose_region_motif(region, motif_part)

        # S3 キーは商品単位で衝突しないよう、地域が取れない商品のみ画像IDを付与する
        # （地域があれば core が一意なので付与不要・人が読める名前を維持）。
        s3_base = core or item.item_name
        if not region and image_id:
            s3_base = f"{s3_base}_{image_id}"

        # S3 にアップロード（同名商品の画像上書きを防ぐ）
        image_s3_key = ""
        if image_data:
            try:
                image_s3_key = upload_image_to_s3(image_data, s3_base, content_type)
            except Exception as e:
                logger.warning("Image upload failed for %s: %s", s3_base, e)

        image_url = f"{CLOUDFRONT_IMAGES_PREFIX}{image_s3_key}" if image_s3_key else ""

        # エリアは画像から取れた地域を優先、無ければ商品名から推測
        if region:
            area_type, area_name = classify_area(region, area_hint)
        else:
            area_type, area_name = predict_area(item.item_name)

        for character in characters:
            entry_name = _make_entry_name(character, core)

            if entry_name in existing:
                logger.info("Skip existing: %s", entry_name)
                skipped += 1
                continue

            # 自動タグ: キャラ名と地名（空は除外）。両方空なら Tags は付けない。
            tags = {t for t in (character, area_name) if t}

            db_item = {
                "Category": "KeyChain",
                "ItemName": entry_name,
                "Motif": character,
                "AreaType": area_type,
                "AreaName": area_name,
                "ImageUrl": image_url,
                "IsVerified": False,
                "CreatedAt": datetime.now(timezone.utc).isoformat(),
            }
            if tags:
                db_item["Tags"] = tags
            if image_id:
                db_item["SourceImageId"] = image_id

            table.put_item(Item=db_item)
            existing.add(entry_name)
            logger.info(
                "Added: %s (Motif=%s, AreaType=%s, AreaName=%s)",
                entry_name, character, area_type, area_name,
            )
            added += 1

    result = {"added": added, "skipped": skipped}
    logger.info("Done: %s", result)
    return {"statusCode": 200, "body": str(result)}


def _strip_keychain_keyword(title: str) -> str:
    """商品タイトルから "ダイカットキーホルダー" を除去し、空白を正規化したモチーフ部を返す。"""
    core = title.replace(KEYCHAIN_KEYWORD, " ")
    core = re.sub(r"[ 　]+", " ", core).strip()
    return core


def _compose_region_motif(region: str, motif_part: str) -> str:
    """地域名とモチーフ部から「地域 モチーフ」の中核文字列を組み立てる。

    - region 空 → motif_part のみ
    - motif_part 空 → region のみ
    - region が motif_part に含まれる → motif_part（重複回避。例 region=北海道, motif=北海道）
    - それ以外 → "地域 モチーフ"（例 静岡 + みかん → "静岡 みかん"）
    """
    region = (region or "").strip()
    motif_part = (motif_part or "").strip()
    if not region:
        return motif_part
    if not motif_part:
        return region
    if region in motif_part:
        return motif_part
    return f"{region} {motif_part}"


def _make_entry_name(character: str, core: str) -> str:
    """キャラ名を先頭に置いた ItemName を組み立てる。

    形式: "{キャラ}　{地域 モチーフ}　ダイカットキーホルダー"
    （core が空なら "{キャラ}　ダイカットキーホルダー"）
    """
    core = (core or "").strip()
    if core:
        return f"{character}　{core}　{KEYCHAIN_KEYWORD}"
    return f"{character}　{KEYCHAIN_KEYWORD}"


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


def _get_existing_image_ids(table) -> set[str]:
    """登録済みエントリの SourceImageId を集める（商品単位の増分スキップ用）。"""
    ids: set[str] = set()
    kwargs: dict = {
        "KeyConditionExpression": Key("Category").eq("KeyChain"),
        "ProjectionExpression": "SourceImageId",
    }
    while True:
        resp = table.query(**kwargs)
        for item in resp.get("Items", []):
            sid = item.get("SourceImageId")
            if sid:
                ids.add(sid)
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return ids
