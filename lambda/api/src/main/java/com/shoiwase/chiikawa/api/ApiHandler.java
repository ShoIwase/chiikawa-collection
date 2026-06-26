package com.shoiwase.chiikawa.api;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2HTTPResponse;
import com.shoiwase.chiikawa.api.route.CollectionRoute;
import com.shoiwase.chiikawa.api.route.MasterRoute;

import java.util.Map;

public class ApiHandler implements RequestHandler<APIGatewayV2HTTPEvent, APIGatewayV2HTTPResponse> {

    // SnapStart: 静的初期化はスナップショットに含まれ、コールドスタートを短縮する
    private static final CollectionRoute COLLECTION = new CollectionRoute();
    private static final MasterRoute     MASTER     = new MasterRoute();

    @Override
    public APIGatewayV2HTTPResponse handleRequest(APIGatewayV2HTTPEvent event, Context context) {
        String method = event.getRequestContext().getHttp().getMethod();
        String path   = event.getRawPath();

        try {
            if ("GET".equals(method) && "/items".equals(path))
                return COLLECTION.getItems();
            if ("GET".equals(method) && "/items/pending".equals(path))
                return MASTER.getPendingItems();
            if ("PUT".equals(method) && path.matches("/items/[^/]+/status"))
                return COLLECTION.updateStatus(event);
            if ("PUT".equals(method) && path.matches("/items/[^/]+/verify"))
                return MASTER.verifyItem(event);

            return err(404, "Not Found");
        } catch (Exception e) {
            context.getLogger().log("ERROR: " + e.getMessage());
            return err(500, "Internal Server Error");
        }
    }

    private static final Map<String, String> SECURITY_HEADERS = Map.of(
            "Content-Type",                "application/json",
            "Strict-Transport-Security",   "max-age=63072000; includeSubDomains; preload",
            "X-Content-Type-Options",      "nosniff",
            "X-Frame-Options",             "DENY",
            "Cache-Control",               "no-store",
            "Referrer-Policy",             "strict-origin-when-cross-origin"
    );

    public static APIGatewayV2HTTPResponse ok(String body) {
        return APIGatewayV2HTTPResponse.builder()
                .withStatusCode(200)
                .withHeaders(SECURITY_HEADERS)
                .withBody(body)
                .build();
    }

    public static APIGatewayV2HTTPResponse err(int status, String message) {
        return APIGatewayV2HTTPResponse.builder()
                .withStatusCode(status)
                .withHeaders(SECURITY_HEADERS)
                .withBody("{\"message\":\"" + message + "\"}")
                .build();
    }
}
