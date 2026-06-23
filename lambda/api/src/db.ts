import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const MASTER_TABLE = process.env.MASTER_TABLE!;
export const COLLECTION_TABLE = process.env.COLLECTION_TABLE!;
export const FAMILY_ID = process.env.FAMILY_ID!;
