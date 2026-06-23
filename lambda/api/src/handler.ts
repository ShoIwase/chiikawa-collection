import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getItems, updateStatus } from "./routes/collection";
import { getPendingItems, verifyItem } from "./routes/master";
import { err } from "./types";

export const lambdaHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  try {
    if (method === "GET" && path === "/items") return getItems();
    if (method === "GET" && path === "/items/pending") return getPendingItems();
    if (method === "PUT" && /^\/items\/[^/]+\/status$/.test(path)) return updateStatus(event);
    if (method === "PUT" && /^\/items\/[^/]+\/verify$/.test(path)) return verifyItem(event);

    return err(404, "Not Found");
  } catch (e) {
    console.error(e);
    return err(500, "Internal Server Error");
  }
};
