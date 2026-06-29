package com.shoiwase.chiikawa.api.route;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MasterRouteTest {

    @Mock
    DynamoDbClient mockClient;

    MasterRoute route;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        route = new MasterRoute(mockClient);
    }

    // -----------------------------------------------------------------------
    // GET /items/pending
    // -----------------------------------------------------------------------

    @Test
    void getPendingItems_returnsUnverifiedItems() throws Exception {
        var item = Map.of(
                "Category",   av("KeyChain"),
                "ItemName",   av("箱根 ダイカットキーホルダー"),
                "Motif",      av("ちいかわ"),
                "AreaType",   av("温泉地"),
                "AreaName",   av("箱根"),
                "ImageUrl",   av(""),
                "IsVerified", AttributeValue.fromBool(false),
                "CreatedAt",  av("2026-06-01T00:00:00Z")
        );

        when(mockClient.query(any(QueryRequest.class)))
                .thenReturn(QueryResponse.builder().items(List.of(item)).build());

        var resp = route.getPendingItems();

        assertEquals(200, resp.getStatusCode());
        var items = mapper.readTree(resp.getBody()).get("items");
        assertEquals(1, items.size());
        assertEquals("箱根 ダイカットキーホルダー", items.get(0).get("ItemName").asText());
    }

    @Test
    void getPendingItems_empty_returnsEmptyList() throws Exception {
        when(mockClient.query(any(QueryRequest.class)))
                .thenReturn(QueryResponse.builder().items(List.of()).build());

        var resp = route.getPendingItems();
        assertEquals(200, resp.getStatusCode());
        assertTrue(mapper.readTree(resp.getBody()).get("items").isEmpty());
    }

    // -----------------------------------------------------------------------
    // PUT /items/{itemName}/verify
    // -----------------------------------------------------------------------

    @Test
    void verifyItem_setsIsVerifiedTrue() throws Exception {
        when(mockClient.updateItem(any(UpdateItemRequest.class)))
                .thenReturn(UpdateItemResponse.builder().build());

        var event = eventWithPath("箱根%20ダイカットキーホルダー", "{}");
        var resp = route.verifyItem(event);

        assertEquals(200, resp.getStatusCode());
        var captor = ArgumentCaptor.forClass(UpdateItemRequest.class);
        verify(mockClient).updateItem(captor.capture());
        var req = captor.getValue();
        assertEquals("箱根 ダイカットキーホルダー", req.key().get("ItemName").s());
        assertTrue(req.updateExpression().contains("IsVerified"));
    }

    @Test
    void verifyItem_withAreaUpdate_includesAreaInExpression() throws Exception {
        when(mockClient.updateItem(any(UpdateItemRequest.class)))
                .thenReturn(UpdateItemResponse.builder().build());

        var body = "{\"areaType\":\"温泉地\",\"areaName\":\"箱根\",\"motif\":\"ハチワレ\"}";
        var event = eventWithPath("箱根%20ダイカットキーホルダー", body);
        route.verifyItem(event);

        var captor = ArgumentCaptor.forClass(UpdateItemRequest.class);
        verify(mockClient).updateItem(captor.capture());
        var req = captor.getValue();
        assertTrue(req.updateExpression().contains("AreaType"));
        assertTrue(req.updateExpression().contains("AreaName"));
        assertTrue(req.updateExpression().contains("Motif"));
        assertEquals("温泉地", req.expressionAttributeValues().get(":areaType").s());
        assertEquals("箱根",   req.expressionAttributeValues().get(":areaName").s());
    }

    @Test
    void verifyItem_missingItemName_returns400() throws Exception {
        var event = APIGatewayV2HTTPEvent.builder().withBody("{}").build();
        var resp = route.verifyItem(event);
        assertEquals(400, resp.getStatusCode());
    }

    @Test
    void verifyItem_itemNotFound_returns404() throws Exception {
        when(mockClient.updateItem(any(UpdateItemRequest.class)))
                .thenThrow(ConditionalCheckFailedException.builder()
                        .message("The conditional request failed").build());

        var resp = route.verifyItem(eventWithPath("存在しないアイテム", "{}"));
        assertEquals(404, resp.getStatusCode());
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    private static AttributeValue av(String s) {
        return AttributeValue.fromS(s);
    }

    private static APIGatewayV2HTTPEvent eventWithPath(String itemName, String body) {
        return APIGatewayV2HTTPEvent.builder()
                .withPathParameters(Map.of("itemName", itemName))
                .withBody(body)
                .build();
    }
}
