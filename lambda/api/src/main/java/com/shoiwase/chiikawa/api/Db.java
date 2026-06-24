package com.shoiwase.chiikawa.api;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.Map;

public final class Db {

    public static final DynamoDbClient CLIENT = DynamoDbClient.builder()
            .region(Region.AP_NORTHEAST_1)
            .build();

    public static final String MASTER_TABLE     = System.getenv("MASTER_TABLE");
    public static final String COLLECTION_TABLE = System.getenv("COLLECTION_TABLE");
    public static final String FAMILY_ID        = System.getenv("FAMILY_ID");

    private Db() {}

    public static String str(Map<String, AttributeValue> item, String key) {
        AttributeValue v = item.get(key);
        return v != null && v.s() != null ? v.s() : "";
    }

    public static boolean bool(Map<String, AttributeValue> item, String key) {
        AttributeValue v = item.get(key);
        return v != null && Boolean.TRUE.equals(v.bool());
    }
}
