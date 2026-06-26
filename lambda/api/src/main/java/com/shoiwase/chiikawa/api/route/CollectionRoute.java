package com.shoiwase.chiikawa.api.route;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shoiwase.chiikawa.api.Db;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

import static com.shoiwase.chiikawa.api.ApiHandler.ok;
import static com.shoiwase.chiikawa.api.ApiHandler.err;

public class CollectionRoute {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final DynamoDbClient client;

    public CollectionRoute() {
        this.client = Db.CLIENT;
    }

    // テスト用: モッククライアントを注入
    public CollectionRoute(DynamoDbClient client) {
        this.client = client;
    }

    public APIGatewayV2HTTPResponse getItems() throws Exception {
        List<Map<String, AttributeValue>> masterItems = queryAllMasterVerified();
        if (masterItems.isEmpty()) {
            return ok("{\"items\":[]}");
        }

        Map<String, Map<String, AttributeValue>> colMap = batchGetCollection(masterItems);

        List<Map<String, Object>> items = masterItems.stream().map(m -> {
            String name = Db.str(m, "ItemName");
            Map<String, AttributeValue> col = colMap.get(name);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ItemName",   name);
            item.put("Motif",      Db.str(m, "Motif"));
            item.put("AreaType",   Db.str(m, "AreaType"));
            item.put("AreaName",   Db.str(m, "AreaName"));
            item.put("ImageUrl",   Db.str(m, "ImageUrl"));
            item.put("CreatedAt",  Db.str(m, "CreatedAt"));
            item.put("Owned",      col != null && Db.bool(col, "Status"));
            if (col != null) item.put("UpdatedAt", Db.str(col, "UpdatedAt"));
            return item;
        }).collect(Collectors.toList());

        return ok(MAPPER.writeValueAsString(Map.of("items", items)));
    }

    public APIGatewayV2HTTPResponse updateStatus(APIGatewayV2HTTPEvent event) throws Exception {
        String itemName = decodePath(event);
        if (itemName == null) return err(400, "itemName is required");

        Map<String, Object> body = MAPPER.readValue(
                event.getBody() != null ? event.getBody() : "{}",
                new TypeReference<>() {});
        Object owned = body.get("owned");
        if (!(owned instanceof Boolean)) return err(400, "owned must be boolean");

        client.updateItem(UpdateItemRequest.builder()
                .tableName(Db.COLLECTION_TABLE)
                .key(Map.of(
                        "FamilyID", AttributeValue.fromS(Db.FAMILY_ID),
                        "ItemName", AttributeValue.fromS(itemName)))
                .updateExpression("SET #s = :status, UpdatedAt = :now")
                .expressionAttributeNames(Map.of("#s", "Status"))
                .expressionAttributeValues(Map.of(
                        ":status", AttributeValue.fromBool((Boolean) owned),
                        ":now",    AttributeValue.fromS(Instant.now().toString())))
                .build());

        return ok("{\"success\":true}");
    }

    // -----------------------------------------------------------------------

    private List<Map<String, AttributeValue>> queryAllMasterVerified() {
        List<Map<String, AttributeValue>> result = new ArrayList<>();
        Map<String, AttributeValue> lastKey = null;
        do {
            var req = QueryRequest.builder()
                    .tableName(Db.MASTER_TABLE)
                    .keyConditionExpression("Category = :cat")
                    .filterExpression("IsVerified = :v")
                    .expressionAttributeValues(Map.of(
                            ":cat", AttributeValue.fromS("KeyChain"),
                            ":v",   AttributeValue.fromBool(true)))
                    .exclusiveStartKey(lastKey)
                    .build();
            var resp = client.query(req);
            result.addAll(resp.items());
            lastKey = resp.lastEvaluatedKey().isEmpty() ? null : resp.lastEvaluatedKey();
        } while (lastKey != null);
        return result;
    }

    private Map<String, Map<String, AttributeValue>> batchGetCollection(
            List<Map<String, AttributeValue>> masterItems) {

        Map<String, Map<String, AttributeValue>> result = new HashMap<>();
        List<Map<String, AttributeValue>> keys = masterItems.stream()
                .map(m -> Map.of(
                        "FamilyID", AttributeValue.fromS(Db.FAMILY_ID),
                        "ItemName", m.get("ItemName")))
                .collect(Collectors.toList());

        for (int i = 0; i < keys.size(); i += 100) {
            List<Map<String, AttributeValue>> chunk = keys.subList(i, Math.min(i + 100, keys.size()));
            var resp = client.batchGetItem(BatchGetItemRequest.builder()
                    .requestItems(Map.of(
                            Db.COLLECTION_TABLE, KeysAndAttributes.builder().keys(chunk).build()))
                    .build());
            resp.responses().getOrDefault(Db.COLLECTION_TABLE, List.of())
                    .forEach(item -> result.put(Db.str(item, "ItemName"), item));
        }
        return result;
    }

    private String decodePath(APIGatewayV2HTTPEvent event) {
        Map<String, String> params = event.getPathParameters();
        if (params == null) return null;
        String raw = params.get("itemName");
        if (raw == null) return null;
        return URLDecoder.decode(raw, StandardCharsets.UTF_8);
    }
}
