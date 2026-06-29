package com.shoiwase.chiikawa.api.integration;

import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shoiwase.chiikawa.api.route.CollectionRoute;
import com.shoiwase.chiikawa.api.route.MasterRoute;
import org.junit.jupiter.api.*;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.net.URI;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RoutesIntegrationTest {

    static final String MASTER_TABLE     = "ChiikawaMaster";
    static final String COLLECTION_TABLE = "UserCollection";
    static final String FAMILY_ID        = "shoiwase";

    @Container
    static GenericContainer<?> dynamoDbLocal =
            new GenericContainer<>("amazon/dynamodb-local:2.3.0")
                    .withExposedPorts(8000)
                    .withCommand("-jar DynamoDBLocal.jar -inMemory");

    static DynamoDbClient client;
    static CollectionRoute collectionRoute;
    static MasterRoute masterRoute;
    static ObjectMapper mapper = new ObjectMapper();

    @BeforeAll
    static void setupAll() {
        // 環境変数を設定 (Db クラスの定数が参照する)
        System.setProperty("MASTER_TABLE",     MASTER_TABLE);
        System.setProperty("COLLECTION_TABLE", COLLECTION_TABLE);
        System.setProperty("FAMILY_ID",        FAMILY_ID);

        client = DynamoDbClient.builder()
                .endpointOverride(URI.create(
                        "http://localhost:" + dynamoDbLocal.getMappedPort(8000)))
                .region(Region.AP_NORTHEAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("fake", "fake")))
                .build();

        createTables();

        collectionRoute = new CollectionRoute(client);
        masterRoute     = new MasterRoute(client);
    }

    @BeforeEach
    void cleanUp() {
        // テーブルを空にしてから各テストを実行
        deleteAllItems(MASTER_TABLE,     "Category", "ItemName");
        deleteAllItems(COLLECTION_TABLE, "FamilyID", "ItemName");
    }

    // -----------------------------------------------------------------------
    // CollectionRoute: GET /items
    // -----------------------------------------------------------------------

    @Test
    @Order(1)
    void getItems_noData_returnsEmpty() throws Exception {
        var resp = collectionRoute.getItems();
        assertEquals(200, resp.getStatusCode());
        assertTrue(mapper.readTree(resp.getBody()).get("items").isEmpty());
    }

    @Test
    @Order(2)
    void getItems_verifiedItemWithCollection_returnsOwned() throws Exception {
        putMasterItem("北海道 ダイカットキーホルダー", "ちいかわ", "都道府県", "北海道", true);
        putCollectionItem("北海道 ダイカットキーホルダー", true);

        var resp = collectionRoute.getItems();
        JsonNode items = mapper.readTree(resp.getBody()).get("items");
        assertEquals(1, items.size());
        assertTrue(items.get(0).get("Owned").asBoolean());
    }

    @Test
    @Order(3)
    void getItems_unverifiedItemIsExcluded() throws Exception {
        putMasterItem("未確認アイテム ダイカットキーホルダー", "ちいかわ", "市町村", "未確認", false);

        var resp = collectionRoute.getItems();
        assertTrue(mapper.readTree(resp.getBody()).get("items").isEmpty());
    }

    // -----------------------------------------------------------------------
    // CollectionRoute: PUT /items/{itemName}/status
    // -----------------------------------------------------------------------

    @Test
    @Order(4)
    void updateStatus_setsOwnedTrue_thenFalse() throws Exception {
        putMasterItem("沖縄 ダイカットキーホルダー", "ちいかわ", "都道府県", "沖縄", true);

        // 所持フラグ ON
        collectionRoute.updateStatus(eventWithPath("沖縄%20ダイカットキーホルダー", "{\"owned\":true}"));
        assertTrue(getCollectionStatus("沖縄 ダイカットキーホルダー"));

        // 所持フラグ OFF
        collectionRoute.updateStatus(eventWithPath("沖縄%20ダイカットキーホルダー", "{\"owned\":false}"));
        assertFalse(getCollectionStatus("沖縄 ダイカットキーホルダー"));
    }

    // -----------------------------------------------------------------------
    // MasterRoute: GET /items/pending
    // -----------------------------------------------------------------------

    @Test
    @Order(5)
    void getPendingItems_returnsOnlyUnverified() throws Exception {
        putMasterItem("確認済み ダイカットキーホルダー",   "ちいかわ", "都道府県", "東京", true);
        putMasterItem("未確認 ダイカットキーホルダー",     "うさぎ",   "市町村",   "行徳", false);

        var resp = masterRoute.getPendingItems();
        JsonNode items = mapper.readTree(resp.getBody()).get("items");
        assertEquals(1, items.size());
        assertEquals("未確認 ダイカットキーホルダー", items.get(0).get("ItemName").asText());
    }

    // -----------------------------------------------------------------------
    // MasterRoute: PUT /items/{itemName}/verify
    // -----------------------------------------------------------------------

    @Test
    @Order(6)
    void verifyItem_itemNotFound_returns404() throws Exception {
        // テーブルにアイテムが存在しない状態で verify を呼ぶ
        var resp = masterRoute.verifyItem(eventWithPath("存在しないアイテム", "{}"));
        assertEquals(404, resp.getStatusCode());
    }

    @Test
    @Order(7)
    void verifyItem_setsIsVerifiedAndUpdatesArea() throws Exception {
        putMasterItem("箱根 ダイカットキーホルダー", "ちいかわ", "市町村", "箱根", false);

        var body = "{\"areaType\":\"温泉地\",\"areaName\":\"箱根\",\"motif\":\"ハチワレ\"}";
        var resp = masterRoute.verifyItem(eventWithPath("箱根%20ダイカットキーホルダー", body));
        assertEquals(200, resp.getStatusCode());

        var item = getMasterItem("箱根 ダイカットキーホルダー");
        assertTrue(item.get("IsVerified").bool());
        assertEquals("温泉地", item.get("AreaType").s());
        assertEquals("箱根",   item.get("AreaName").s());
        assertEquals("ハチワレ", item.get("Motif").s());
    }

    // -----------------------------------------------------------------------
    // setup helpers
    // -----------------------------------------------------------------------

    private static void createTables() {
        client.createTable(CreateTableRequest.builder()
                .tableName(MASTER_TABLE)
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .keySchema(
                        KeySchemaElement.builder().attributeName("Category").keyType(KeyType.HASH).build(),
                        KeySchemaElement.builder().attributeName("ItemName").keyType(KeyType.RANGE).build())
                .attributeDefinitions(
                        AttributeDefinition.builder().attributeName("Category").attributeType(ScalarAttributeType.S).build(),
                        AttributeDefinition.builder().attributeName("ItemName").attributeType(ScalarAttributeType.S).build())
                .build());

        client.createTable(CreateTableRequest.builder()
                .tableName(COLLECTION_TABLE)
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .keySchema(
                        KeySchemaElement.builder().attributeName("FamilyID").keyType(KeyType.HASH).build(),
                        KeySchemaElement.builder().attributeName("ItemName").keyType(KeyType.RANGE).build())
                .attributeDefinitions(
                        AttributeDefinition.builder().attributeName("FamilyID").attributeType(ScalarAttributeType.S).build(),
                        AttributeDefinition.builder().attributeName("ItemName").attributeType(ScalarAttributeType.S).build())
                .build());
    }

    private void putMasterItem(String name, String motif, String areaType, String areaName, boolean verified) {
        client.putItem(PutItemRequest.builder()
                .tableName(MASTER_TABLE)
                .item(Map.of(
                        "Category",   AttributeValue.fromS("KeyChain"),
                        "ItemName",   AttributeValue.fromS(name),
                        "Motif",      AttributeValue.fromS(motif),
                        "AreaType",   AttributeValue.fromS(areaType),
                        "AreaName",   AttributeValue.fromS(areaName),
                        "ImageUrl",   AttributeValue.fromS(""),
                        "IsVerified", AttributeValue.fromBool(verified),
                        "CreatedAt",  AttributeValue.fromS("2026-01-01T00:00:00Z")))
                .build());
    }

    private void putCollectionItem(String name, boolean status) {
        client.putItem(PutItemRequest.builder()
                .tableName(COLLECTION_TABLE)
                .item(Map.of(
                        "FamilyID",  AttributeValue.fromS(FAMILY_ID),
                        "ItemName",  AttributeValue.fromS(name),
                        "Status",    AttributeValue.fromBool(status),
                        "UpdatedAt", AttributeValue.fromS("2026-01-01T00:00:00Z")))
                .build());
    }

    private boolean getCollectionStatus(String name) {
        var resp = client.getItem(GetItemRequest.builder()
                .tableName(COLLECTION_TABLE)
                .key(Map.of(
                        "FamilyID", AttributeValue.fromS(FAMILY_ID),
                        "ItemName", AttributeValue.fromS(name)))
                .build());
        return resp.item().getOrDefault("Status", AttributeValue.fromBool(false)).bool();
    }

    private Map<String, AttributeValue> getMasterItem(String name) {
        return client.getItem(GetItemRequest.builder()
                .tableName(MASTER_TABLE)
                .key(Map.of(
                        "Category", AttributeValue.fromS("KeyChain"),
                        "ItemName", AttributeValue.fromS(name)))
                .build()).item();
    }

    private void deleteAllItems(String table, String pk, String sk) {
        var resp = client.scan(ScanRequest.builder().tableName(table).build());
        for (var item : resp.items()) {
            client.deleteItem(DeleteItemRequest.builder()
                    .tableName(table)
                    .key(Map.of(pk, item.get(pk), sk, item.get(sk)))
                    .build());
        }
    }

    private static APIGatewayV2HTTPEvent eventWithPath(String itemName, String body) {
        return APIGatewayV2HTTPEvent.builder()
                .withPathParameters(Map.of("itemName", itemName))
                .withBody(body)
                .build();
    }
}
