package com.shoiwase.chiikawa.api;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

public final class Db {

    public static final DynamoDbClient CLIENT = DynamoDbClient.builder()
            .region(Region.AP_NORTHEAST_1)
            .build();

    public static final String MASTER_TABLE     = env("MASTER_TABLE");
    public static final String COLLECTION_TABLE = env("COLLECTION_TABLE");
    public static final String FAMILY_ID        = env("FAMILY_ID");

    private Db() {}

    /** 環境変数を取得し、未設定の場合はシステムプロパティにフォールバック（テスト用）。 */
    private static String env(String key) {
        String v = System.getenv(key);
        return v != null ? v : System.getProperty(key, "");
    }

    public static String str(Map<String, AttributeValue> item, String key) {
        AttributeValue v = item.get(key);
        return v != null && v.s() != null ? v.s() : "";
    }

    public static boolean bool(Map<String, AttributeValue> item, String key) {
        AttributeValue v = item.get(key);
        return v != null && Boolean.TRUE.equals(v.bool());
    }

    /** DynamoDB String Set (SS) を List<String> に変換。Tags フィールド用。 */
    public static List<String> tags(Map<String, AttributeValue> item) {
        AttributeValue v = item.get("Tags");
        if (v == null || !v.hasSs()) return List.of();
        return v.ss().stream().sorted().toList();
    }
}
