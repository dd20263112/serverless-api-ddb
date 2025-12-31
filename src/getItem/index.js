const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const itemId = event.pathParameters?.itemId; // <-- matches /items/{itemId}

    if (!itemId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "itemId path parameter is required" })
      };
    }

    const res = await ddb.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { itemId } // <-- matches table PK name
      })
    );

    if (!res.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "not found", itemId })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(res.Item)
    };
  } catch (err) {
    console.error("GetItem error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "internal error", error: String(err) })
    };
  }
};
