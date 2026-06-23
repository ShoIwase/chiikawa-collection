import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ddb, MASTER_TABLE } from "../db";
import type { MasterItem } from "../types";
import { ok, err } from "../types";

export async function getPendingItems() {
  const result = await ddb.send(
    new QueryCommand({
      TableName: MASTER_TABLE,
      KeyConditionExpression: "Category = :cat",
      FilterExpression: "IsVerified = :notVerified",
      ExpressionAttributeValues: {
        ":cat": "KeyChain",
        ":notVerified": false,
      },
    })
  );

  return ok({ items: (result.Items ?? []) as MasterItem[] });
}

export async function verifyItem(event: APIGatewayProxyEventV2) {
  const rawName = event.pathParameters?.itemName;
  if (!rawName) return err(400, "itemName is required");
  const itemName = decodeURIComponent(rawName);

  const body = JSON.parse(event.body ?? "{}") as {
    areaType?: string;
    areaName?: string;
    motif?: string;
  };

  const updates: string[] = ["IsVerified = :verified"];
  const values: Record<string, unknown> = { ":verified": true };

  if (body.areaType !== undefined) {
    updates.push("AreaType = :areaType");
    values[":areaType"] = body.areaType;
  }
  if (body.areaName !== undefined) {
    updates.push("AreaName = :areaName");
    values[":areaName"] = body.areaName;
  }
  if (body.motif !== undefined) {
    updates.push("Motif = :motif");
    values[":motif"] = body.motif;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: MASTER_TABLE,
      Key: { Category: "KeyChain", ItemName: itemName },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeValues: values,
      ConditionExpression: "attribute_exists(ItemName)",
    })
  );

  return ok({ success: true });
}
