package com.shoiwase.chiikawa.api;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.shoiwase.chiikawa.api.route.CollectionRoute;
import com.shoiwase.chiikawa.api.route.MasterRoute;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ApiHandlerTest {

    @Mock CollectionRoute mockCollection;
    @Mock MasterRoute     mockMaster;
    @Mock Context         mockContext;
    @Mock LambdaLogger    mockLogger;

    ApiHandler handler;

    @BeforeEach
    void setUp() {
        handler = new ApiHandler(mockCollection, mockMaster);
    }

    // -----------------------------------------------------------------------
    // ルーティング
    // -----------------------------------------------------------------------

    @Test
    void GET_items_routesToCollectionGetItems() throws Exception {
        when(mockCollection.getItems()).thenReturn(ApiHandler.ok("{\"items\":[]}"));

        var resp = handler.handleRequest(event("GET", "/items", null, null), mockContext);

        assertEquals(200, resp.getStatusCode());
        verify(mockCollection).getItems();
        verifyNoInteractions(mockMaster);
    }

    @Test
    void GET_items_pending_routesToMasterGetPendingItems() throws Exception {
        when(mockMaster.getPendingItems()).thenReturn(ApiHandler.ok("{\"items\":[]}"));

        var resp = handler.handleRequest(event("GET", "/items/pending", null, null), mockContext);

        assertEquals(200, resp.getStatusCode());
        verify(mockMaster).getPendingItems();
        verifyNoInteractions(mockCollection);
    }

    @Test
    void PUT_items_status_routesToCollectionUpdateStatus() throws Exception {
        when(mockCollection.updateStatus(any())).thenReturn(ApiHandler.ok("{\"success\":true}"));

        var resp = handler.handleRequest(
                event("PUT", "/items/%E5%8C%97%E6%B5%B7%E9%81%93/status",
                        Map.of("itemName", "%E5%8C%97%E6%B5%B7%E9%81%93"), "{\"owned\":true}"),
                mockContext);

        assertEquals(200, resp.getStatusCode());
        verify(mockCollection).updateStatus(any());
    }

    @Test
    void PUT_items_verify_routesToMasterVerifyItem() throws Exception {
        when(mockMaster.verifyItem(any())).thenReturn(ApiHandler.ok("{}"));

        var resp = handler.handleRequest(
                event("PUT", "/items/%E7%AE%B1%E6%A0%B9/verify",
                        Map.of("itemName", "%E7%AE%B1%E6%A0%B9"), "{}"),
                mockContext);

        assertEquals(200, resp.getStatusCode());
        verify(mockMaster).verifyItem(any());
    }

    @Test
    void unknownRoute_returns404() {
        var resp = handler.handleRequest(event("GET", "/unknown", null, null), mockContext);
        assertEquals(404, resp.getStatusCode());
    }

    @Test
    void exceptionInRoute_returns500() throws Exception {
        when(mockCollection.getItems()).thenThrow(new RuntimeException("DynamoDB error"));
        when(mockContext.getLogger()).thenReturn(mockLogger);

        var resp = handler.handleRequest(event("GET", "/items", null, null), mockContext);

        assertEquals(500, resp.getStatusCode());
    }

    // -----------------------------------------------------------------------
    // セキュリティヘッダー
    // -----------------------------------------------------------------------

    @Test
    void allResponses_containSecurityHeaders() throws Exception {
        when(mockCollection.getItems()).thenReturn(ApiHandler.ok("{}"));

        var resp = handler.handleRequest(event("GET", "/items", null, null), mockContext);

        assertSecurityHeaders(resp);
    }

    @Test
    void errorResponse_containsSecurityHeaders() {
        var resp = handler.handleRequest(event("GET", "/unknown", null, null), mockContext);
        assertSecurityHeaders(resp);
    }

    private void assertSecurityHeaders(APIGatewayV2HTTPResponse resp) {
        Map<String, String> h = resp.getHeaders();
        assertEquals("application/json",                       h.get("Content-Type"));
        assertEquals("max-age=63072000; includeSubDomains; preload", h.get("Strict-Transport-Security"));
        assertEquals("nosniff",                                h.get("X-Content-Type-Options"));
        assertEquals("DENY",                                   h.get("X-Frame-Options"));
        assertEquals("no-store",                               h.get("Cache-Control"));
        assertEquals("strict-origin-when-cross-origin",        h.get("Referrer-Policy"));
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    private static APIGatewayV2HTTPEvent event(String method, String path,
                                               Map<String, String> pathParams, String body) {
        return APIGatewayV2HTTPEvent.builder()
                .withRequestContext(APIGatewayV2HTTPEvent.RequestContext.builder()
                        .withHttp(APIGatewayV2HTTPEvent.RequestContext.Http.builder()
                                .withMethod(method)
                                .build())
                        .build())
                .withRawPath(path)
                .withPathParameters(pathParams)
                .withBody(body)
                .build();
    }
}
