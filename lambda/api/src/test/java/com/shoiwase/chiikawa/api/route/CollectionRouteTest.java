package com.shoiwase.chiikawa.api.route;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
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
class CollectionRouteTest {

    @Mock
    DynamoDbClient mockClient;

    CollectionRoute route;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        route = new CollectionRoute(mockClient);
    }

    // -----------------------------------------------------------------------
    // GET /items
    // -----------------------------------------------------------------------

    @Test
    void getItems_masterEmpty_returnsEmptyList() throws Exception {
        when(mockClient.query(any(QueryRequest.class)))
                .thenReturn(QueryResponse.builder().items(List.of()).build());

        APIGatewayV2HTTPResponse resp = route.getItems();

        assertEquals(200, resp.getStatusCode());
        var body = mapper.readTree(resp.getBody());
        assertTrue(body.get("items").isEmpty());
    }

    @Test
    void getItems_withItems_joinsCollectionData() throws Exception {
        var masterItem = Map.of(
                "Category",   av("KeyChain"),
                "ItemName",   av("北海道 ダイカットキーホルダー"),
                "Motif",      av("ちいかわ"),
                "AreaType",   av("都道府県"),
                "AreaName",   av("北海道"),
                "ImageUrl",   av("/images/hokkaido.jpg"),
                "IsVerified", AttributeValue.fromBool(true),
                "CreatedAt",  av("2026-01-01T00:00:00Z")
        );
        var collectionItem = Map.of(
                "FamilyID", av("shoiwase"),
                "ItemName", av("北海道 ダイカットキーホルダー"),
                "Status",   AttributeValue.fromBool(true),
                "UpdatedAt",av("2026-06-01T00:00:00Z")
        );

        when(mockClient.query(any(QueryRequest.class)))
                .thenReturn(QueryResponse.builder().items(List.of(masterItem)).build());
        when(mockClient.batchGetItem(any(BatchGetItemRequest.class)))
                .thenReturn(BatchGetItemResponse.builder()
                        .responses(Map.of("UserCollection", List.of(collectionItem)))
                        .build());

        APIGatewayV2HTTPResponse resp = route.getItems();

        assertEquals(200, resp.getStatusCode());
        var items = mapper.readTree(resp.getBody()).get("items");
        assertEquals(1, items.size());
        assertEquals("北海道 ダイカットキーホルダー", items.get(0).get("ItemName").asText());
        assertTrue(items.get(0).get("Owned").asBoolean());
    }

    @Test
    void getItems_noCollectionRecord_ownedIsFalse() throws Exception {
        var masterItem = Map.of(
                "Category",   av("KeyChain"),
                "ItemName",   av("沖縄 ダイカットキーホルダー"),
                "Motif",      av("ちいかわ"),
                "AreaType",   av("都道府県"),
                "AreaName",   av("沖縄"),
                "ImageUrl",   av(""),
                "IsVerified", AttributeValue.fromBool(true),
                "CreatedAt",  av("2026-01-01T00:00:00Z")
        );

        when(mockClient.query(any(QueryRequest.class)))
                .thenReturn(QueryResponse.builder().items(List.of(masterItem)).build());
        when(mockClient.batchGetItem(any(BatchGetItemRequest.class)))
                .thenReturn(BatchGetItemResponse.builder()
                        .responses(Map.of("UserCollection", List.of()))
                        .build());

        var resp = route.getItems();
        var items = mapper.readTree(resp.getBody()).get("items");
        assertFalse(items.get(0).get("Owned").asBoolean());
    }

    // -----------------------------------------------------------------------
    // PUT /items/{itemName}/status
    // -----------------------------------------------------------------------

    @Test
    void updateStatus_validRequest_callsUpdateItem() throws Exception {
        when(mockClient.updateItem(any(UpdateItemRequest.class)))
                .thenReturn(UpdateItemResponse.builder().build());

        var event = eventWithPath("小樽運河%20ダイカットキーホルダー", "{\"owned\":true}");
        var resp = route.updateStatus(event);

        assertEquals(200, resp.getStatusCode());
        var captor = ArgumentCaptor.forClass(UpdateItemRequest.class);
        verify(mockClient).updateItem(captor.capture());
        assertEquals("小樽運河 ダイカットキーホルダー",
                captor.getValue().key().get("ItemName").s());
    }

    @Test
    void updateStatus_missingItemName_returns400() throws Exception {
        var event = APIGatewayV2HTTPEvent.builder()
                .withBody("{\"owned\":true}")
                .build();

        var resp = route.updateStatus(event);
        assertEquals(400, resp.getStatusCode());
    }

    @Test
    void updateStatus_ownedNotBoolean_returns400() throws Exception {
        var event = eventWithPath("some-item", "{\"owned\":\"yes\"}");
        var resp = route.updateStatus(event);
        assertEquals(400, resp.getStatusCode());
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
