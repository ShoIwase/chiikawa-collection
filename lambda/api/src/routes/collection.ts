import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ddb, MASTER_TABLE, COLLECTION_TABLE, FAMILY_ID } from "../db";
import type { MasterItem, CollectionStatus, CollectionItem } from "../types";
import { ok, err } from "../types";

export async function getItems() {
  // 1. IsVerified=true のマスターデータを全件取得
  const masterResult = await ddb.send(
    new QueryCommand({
      TableName: MASTER_TABLE,
      KeyConditionExpression: "Category = :cat",
      FilterExpression: "IsVerified = :verified",
      ExpressionAttributeValues: {
        ":cat": "KeyChain",
        ":verified": true,
      },
    })
  );

  const masterItems = (masterResult.Items ?? []) as MasterItem[];
  if (masterItems.length === 0) return ok({ items: [] });

  // 2. UserCollection から所持状態を一括取得
  const keys = masterItems.map((item) => ({
    FamilyID: FAMILY_ID,
    ItemName: item.ItemName,
  }));

  // BatchGetItem は 100 件ずつに分割
  const collectionMap = new Map<string, CollectionStatus>();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const batchResult = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [COLLECTION_TABLE]: { Keys: chunk },
        },
      })
    );
    for (const item of (batchResult.Responses?.[COLLECTION_TABLE] ?? []) as CollectionStatus[]) {
      collectionMap.set(item.ItemName, item);
    }
  }

  const items: CollectionItem[] = masterItems.map((master) => {
    const col = collectionMap.get(master.ItemName);
    return {
      ...master,
      Owned: col?.Status ?? false,
      UpdatedAt: col?.UpdatedAt,
    };
  });

  return ok({ items });
}

export async function updateStatus(event: APIGatewayProxyEventV2) {
  const rawName = event.pathParameters?.itemName;
  if (!rawName) return err(400, "itemName is required");
  const itemName = decodeURIComponent(rawName);

  const body = JSON.parse(event.body ?? "{}") as { owned: boolean };
  if (typeof body.owned !== "boolean") return err(400, "owned must be boolean");

  await ddb.send(
    new UpdateCommand({
      TableName: COLLECTION_TABLE,
      Key: { FamilyID: FAMILY_ID, ItemName: itemName },
      UpdateExpression: "SET #s = :status, UpdatedAt = :now",
      ExpressionAttributeNames: { "#s": "Status" },
      ExpressionAttributeValues: {
        ":status": body.owned,
        ":now": new Date().toISOString(),
      },
    })
  );

  return ok({ success: true });
}
