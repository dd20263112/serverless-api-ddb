const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    // This is the machine route: /machine/items/{itemId}
    // Auth is enforced by API Gateway authorizer, not here.
    const itemId = event.pathParameters?.itemId;

    if (!itemId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "itemId path parameter is required" })
      };
    }

    const res = await ddb.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { itemId }
      })
    );

    if (!res.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "not found", itemId })
      };
    }

    // Optional: you can return a slightly different payload for machine route
    return {
      statusCode: 200,
      body: JSON.stringify({
        source: "machine-route",
        item: res.Item
      })
    };
  } catch (err) {
    console.error("GetItemMachine error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "internal error", error: String(err) })
    };
  }
};
