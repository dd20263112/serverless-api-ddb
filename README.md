# Serverless API POC (AWS SAM + API Gateway REST + Lambda + DynamoDB + Cognito + EventBridge)

This repo is a hands‑on serverless POC built with AWS SAM.

What it demonstrates (quick scan):
- **API Gateway (REST)** + **Lambda (Node.js 20)**
- **DynamoDB** table (`serverless-api-ddb-items`) with partition key `itemId` (string)
- **Cognito User Pool authorizers**
  - **Route A (human):** user signs in → **ID token** protects `POST /items`
  - **Route B (machine-to-machine):** OAuth **client credentials** → scoped **access token** protects `GET /machine/items/{itemId}`
- **EventBridge**: after a successful DynamoDB put, publish an `ItemCreated` event → trigger a subscriber Lambda

---

## Architecture

```mermaid
flowchart LR
  subgraph Client
    U[Human user] 
    M[Machine client]
  end

  subgraph Cognito
    UP[(User Pool)]
    RSC[Resource Server\nscopes: items.read/items.write]
    TOK[/oauth2/token\nclient_credentials/]
  end

  subgraph API[API Gateway (REST) - Stage: Prod]
    POST[POST /items\nCognito Authorizer (human)]
    GETPUB[GET /items/{itemId}\npublic]
    GETM[GET /machine/items/{itemId}\nCognito Authorizer + scopes]
  end

  subgraph Lambdas
    C(CreateItemFunction)
    G(GetItemFunction)
    GM(GetItemMachineFunction)
    AUD(ItemCreatedAuditLoggerFunction)
  end

  DDB[(DynamoDB\nserverless-api-ddb-items)]
  EB[(EventBridge\nDefault bus)]

  U -->|ID token| POST
  POST --> C
  C --> DDB
  C -->|PutEvents\nSource: serverless-api-ddb\nDetailType: ItemCreated| EB
  EB -->|Rule match| AUD

  GETPUB --> G
  G --> DDB

  M -->|client_id + client_secret| TOK
  TOK -->|access token + scope\nserverless-api-ddb/items.read| GETM
  GETM --> GM
  GM --> DDB

  UP --- RSC
  TOK --- UP
```

---

## Repo structure

```
serverless-api-ddb/
  template.yaml
  src/
    createItem/
      index.js
      package.json
    getItem/
      index.js
      package.json
    getItemMachine/
      index.js
      package.json
    itemCreatedAuditLogger/
      index.js
      package.json
```

---

## Prerequisites

- AWS CLI configured (`aws configure`) with permissions to deploy SAM stacks
- AWS SAM CLI
- Node.js 20+ (SAM will bundle deps during `sam build`)
- Region used in this POC: `ap-southeast-2`

---

## Deploy

From the `serverless-api-ddb/` folder:

```bash
sam build
sam deploy --guided
```

Notes:
- The table name is fixed in the template: **`serverless-api-ddb-items`**
- The stack outputs include the API URL and Cognito IDs (handy for testing)

---

## API endpoints

Base URL (from stack outputs):

- `https://<api-id>.execute-api.<region>.amazonaws.com/Prod`

Routes:
- `POST /items` → creates a record in DynamoDB (**protected: human Cognito authorizer**)
- `GET /items/{itemId}` → reads item (**public**)
- `GET /machine/items/{itemId}` → reads item (**protected: machine token + scope**)

---

## Testing

### 1) Public GET

```bash
curl -s "${API_URL}/items/item-001"
```

Expected:
- `200` with the item JSON if it exists
- `404` if not

### 2) Route A (human) — POST /items using an **ID token**

1) Create a user in the Cognito User Pool (console), set a password, and sign in.
2) Use the **ID token** (not access token) as Bearer.

Example:

```bash
curl -i -X POST "${API_URL}/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{"itemId":"item-003","data":"eventbridge test"}'
```

Expected:
- `201` with `{"message":"created","itemId":"item-003"}`
- `409` if you POST the same `itemId` again (conditional write)

#### Why ID token works but access token may 401 here

API Gateway’s Cognito user pool authorizer commonly validates the JWT audience against the **app client id** (`aud`).
- **ID token** includes `aud = <app client id>`
- **Access token** typically uses `client_id` instead of `aud`

So the same Cognito user can have both tokens, but the authorizer often accepts the **ID token** and rejects the **access token** with `401 Unauthorized`.

(For machine-to-machine we use access tokens with scopes — see below.)

### 3) EventBridge flow verification

After a successful `POST /items`:

- CreateItemFunction publishes:
  - `Source: "serverless-api-ddb"`
  - `DetailType: "ItemCreated"`
  - `Detail: { itemId, createdAt }`

Check the subscriber Lambda logs:
- CloudWatch → Log groups → `/aws/lambda/<...ItemCreatedAuditLogger...>`

You should see a line like:

```
AUDIT: ItemCreated for itemId=item-003, createdAt=2025-12-31T04:07:08.141Z
```

### 4) Route B (machine-to-machine) — client credentials + scopes

This POC sets up a machine app client with:
- OAuth flow: `client_credentials`
- scopes: `serverless-api-ddb/items.read`, `serverless-api-ddb/items.write`

Get a machine access token (Basic Auth is `client_id:client_secret`):

```bash
curl -s -X POST "${COGNITO_TOKEN_ENDPOINT}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "${MACHINE_CLIENT_ID}:${MACHINE_CLIENT_SECRET}" \
  -d "grant_type=client_credentials&scope=serverless-api-ddb/items.read"
```

Then call the machine route:

```bash
curl -s "${API_URL}/machine/items/item-003" \
  -H "Authorization: Bearer ${MACHINE_ACCESS_TOKEN}"
```

---

## Troubleshooting notes (stuff I actually hit while building)

- **Calling the stage root** (`/Prod`) instead of a real route (`/Prod/items`) leads to confusing errors. Always include the resource path.
- **`Invalid scope requested`** usually means the **Resource Server identifier** doesn’t match the scopes you request. In this repo the identifier is `serverless-api-ddb`, so scopes look like `serverless-api-ddb/items.read`.
- **Lambda `HandlerNotFound`** (`index.handler is undefined or not exported`) happens if:
  - the deployed `index.js` is empty / unsaved, or
  - the handler name doesn’t match the export

---

## What I’d add next (optional)

If I were polishing this further for production patterns:
- DLQ for the subscriber Lambda
- structured logging + correlation id
- basic unit tests (Jest)
- request validation (API Gateway models or Lambda-side)

---

## License

MIT (or choose your preferred license)
