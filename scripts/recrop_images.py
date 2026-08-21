#!/usr/bin/env python3
"""既に S3 に入っている商品画像を、現在の crop ルールで切り出し直す。

`scraper.crop_character` の切り出し窓を変えても、S3 の既存画像は古い切り出しのまま
残る（スクレイパーは SourceImageId 単位でスキップするので再取得されない）。
このスクリプトは DynamoDB の登録内容から元画像 URL を復元して取り直し、
同じ S3 キーへ上書きしたうえで CloudFront を無効化する。

使い方（bar504-admin にスイッチロールしてから）:
    python3 scripts/recrop_images.py            # dry-run（何を上書きするか出すだけ）
    python3 scripts/recrop_images.py --apply    # 実際に上書き＋CloudFront invalidation
"""

import argparse
import io
import os
import sys
import time

import boto3
import requests
from boto3.dynamodb.conditions import Key

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda", "scraper"))
from scraper import crop_character  # noqa: E402

REGION = "ap-northeast-1"
MASTER_TABLE = "ChiikawaMaster"
SOURCE_IMAGE_URL = "https://www.jp-api.com/images/tphoto_{image_id}_0_b.png"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; ChiikawaCollectionBot/1.0; "
        "+https://github.com/shoiwase/chiikawa-collection)"
    )
}


def scan_items(table) -> list[dict]:
    items: list[dict] = []
    kwargs: dict = {
        "KeyConditionExpression": Key("Category").eq("KeyChain"),
        "ProjectionExpression": "ItemName, Motif, ImageUrl, SourceImageId",
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            return items
        kwargs["ExclusiveStartKey"] = last


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="実際に S3 を上書きする")
    args = parser.parse_args()

    account_id = boto3.client("sts").get_caller_identity()["Account"]
    bucket = f"chiikawa-images-{account_id}"
    s3 = boto3.client("s3", region_name=REGION)
    table = boto3.resource("dynamodb", region_name=REGION).Table(MASTER_TABLE)

    items = scan_items(table)
    print(f"{len(items)} items in {MASTER_TABLE}")

    # 同じ元画像を3キャラで共有するので、ダウンロードは商品単位で1回だけ
    source_cache: dict[str, bytes] = {}
    updated = skipped = failed = 0

    for item in sorted(items, key=lambda i: i["ItemName"]):
        name = item["ItemName"]
        motif = item.get("Motif", "")
        image_url = item.get("ImageUrl", "")
        image_id = item.get("SourceImageId", "")

        if not (motif and image_url and image_id):
            print(f"  skip (情報不足): {name}")
            skipped += 1
            continue

        key = image_url.lstrip("/")
        try:
            data = source_cache.get(image_id)
            if data is None:
                url = SOURCE_IMAGE_URL.format(image_id=image_id)
                resp = requests.get(url, headers=HEADERS, timeout=30)
                resp.raise_for_status()
                data = resp.content
                source_cache[image_id] = data
                time.sleep(0.2)  # 元サイトへの負荷を抑える

            cropped = crop_character(data, "image/png", motif)
            if cropped == data:
                print(f"  skip (crop 対象外 motif={motif}): {name}")
                skipped += 1
                continue

            print(f"  {'PUT ' if args.apply else 'DRY '} s3://{bucket}/{key}  ({name})")
            if args.apply:
                s3.upload_fileobj(
                    io.BytesIO(cropped), bucket, key,
                    ExtraArgs={"ContentType": "image/png"},
                )
            updated += 1
        except Exception as e:  # noqa: BLE001 - 1件の失敗で全体を止めない
            print(f"  FAILED {name}: {e}")
            failed += 1

    print(f"\nupdated={updated} skipped={skipped} failed={failed}")

    if args.apply and updated:
        ssm = boto3.client("ssm", region_name=REGION)
        dist_id = ssm.get_parameter(Name="/chiikawa/cloudfront-distribution-id")["Parameter"]["Value"]
        cf = boto3.client("cloudfront")
        inv = cf.create_invalidation(
            DistributionId=dist_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/images/*"]},
                "CallerReference": f"recrop-{int(time.time())}",
            },
        )
        print(f"CloudFront invalidation: {inv['Invalidation']['Id']} ({dist_id})")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
