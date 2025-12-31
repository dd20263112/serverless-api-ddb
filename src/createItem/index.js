const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const eb = new EventBridgeClient({});

exports.handler = async (event) => {
  try {
    console.log("Handler started");
    console.log("TABLE_NAME =", process.env.TABLE_NAME);
    const body = event.body ? JSON.parse(event.body) : {};

    const itemId = body.itemId; // <-- matches table PK name
    const data = body.data ?? body; // allow either {itemId, data:{...}} or arbitrary payload

    if (!itemId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "itemId is required in request body" })
      };
    }

    // Store full payload as "data" + metadata
    console.log("About to call PutCommand");
    const createdAt = new Date().toISOString();
    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          itemId,
          data,
          createdAt
        },
        // Optional safety: prevent overwriting existing itemId
        ConditionExpression: "attribute_not_exists(itemId)"
      })
    );
console.log("PutCommand succeeded");

await eb.send(
  new PutEventsCommand({
    Entries: [
      {
        Source: "serverless-api-ddb",
        EventBusName: "default",
        DetailType: "ItemCreated",
        Detail: JSON.stringify({
          itemId,
          createdAt
        }),
      },
    ],
  })
);


    return {
      statusCode: 201,
      body: JSON.stringify({ message: "created", itemId })
    };
  } catch (err) {
    console.error("CreateItem error:", err);

    // ConditionalCheckFailedException -> item exists
    if (err?.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: "item already exists", error: err.name })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "internal error", error: String(err) })
    };
  }
};
