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
import java.util.*;
import java.util.stream.Collectors;

import static com.shoiwase.chiikawa.api.ApiHandler.ok;
import static com.shoiwase.chiikawa.api.ApiHandler.err;

public class MasterRoute {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final DynamoDbClient client;

    public MasterRoute() {
        this.client = Db.CLIENT;
    }

    // テスト用: モッククライアントを注入
    MasterRoute(DynamoDbClient client) {
        this.client = client;
    }

    public APIGatewayV2HTTPResponse getPendingItems() throws Exception {
        List<Map<String, AttributeValue>> items = new ArrayList<>();
        Map<String, AttributeValue> lastKey = null;
        do {
            var req = QueryRequest.builder()
                    .tableName(Db.MASTER_TABLE)
                    .keyConditionExpression("Category = :cat")
                    .filterExpression("IsVerified = :v")
                    .expressionAttributeValues(Map.of(
                            ":cat", AttributeValue.fromS("KeyChain"),
                            ":v",   AttributeValue.fromBool(false)))
                    .exclusiveStartKey(lastKey)
                    .build();
            var resp = client.query(req);
            items.addAll(resp.items());
            lastKey = resp.lastEvaluatedKey().isEmpty() ? null : resp.lastEvaluatedKey();
        } while (lastKey != null);

        List<Map<String, Object>> result = items.stream().map(m -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("ItemName",  Db.str(m, "ItemName"));
            item.put("Motif",     Db.str(m, "Motif"));
            item.put("AreaType",  Db.str(m, "AreaType"));
            item.put("AreaName",  Db.str(m, "AreaName"));
            item.put("ImageUrl",  Db.str(m, "ImageUrl"));
            item.put("CreatedAt", Db.str(m, "CreatedAt"));
            return item;
        }).collect(Collectors.toList());

        return ok(MAPPER.writeValueAsString(Map.of("items", result)));
    }

    public APIGatewayV2HTTPResponse verifyItem(APIGatewayV2HTTPEvent event) throws Exception {
        Map<String, String> params = event.getPathParameters();
        if (params == null || params.get("itemName") == null) return err(400, "itemName is required");
        String itemName = URLDecoder.decode(params.get("itemName"), StandardCharsets.UTF_8);

        Map<String, Object> body = MAPPER.readValue(
                event.getBody() != null ? event.getBody() : "{}",
                new TypeReference<>() {});

        List<String> setClauses = new ArrayList<>();
        Map<String, AttributeValue> values = new HashMap<>();
        setClauses.add("IsVerified = :verified");
        values.put(":verified", AttributeValue.fromBool(true));

        if (body.containsKey("areaType")) {
            setClauses.add("AreaType = :areaType");
            values.put(":areaType", AttributeValue.fromS((String) body.get("areaType")));
        }
        if (body.containsKey("areaName")) {
            setClauses.add("AreaName = :areaName");
            values.put(":areaName", AttributeValue.fromS((String) body.get("areaName")));
        }
        if (body.containsKey("motif")) {
            setClauses.add("Motif = :motif");
            values.put(":motif", AttributeValue.fromS((String) body.get("motif")));
        }

        client.updateItem(UpdateItemRequest.builder()
                .tableName(Db.MASTER_TABLE)
                .key(Map.of(
                        "Category", AttributeValue.fromS("KeyChain"),
                        "ItemName", AttributeValue.fromS(itemName)))
                .updateExpression("SET " + String.join(", ", setClauses))
                .expressionAttributeValues(values)
                .conditionExpression("attribute_exists(ItemName)")
                .build());

        return ok("{\"success\":true}");
    }
}
