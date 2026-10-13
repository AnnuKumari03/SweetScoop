# NOTES — Assignments 04, 05 & 06

**Course:** CS543 Web Services
**Project:** Sweet Scoop

---

## Assignment 04 — OpenAPI, Swagger & Testing

### 1. Resource Tables

| Resource | Service | Path | Methods |
|----------|---------|------|---------|
| Product | Catalogue | `/v1/products`, `/v1/products/{id}` | GET, POST, PUT, DELETE |
| Inventory | Catalogue | `/v1/products/{id}/inventory` | PATCH |
| Category | Catalogue | `/v1/categories` | GET |
| Customer | Customer | `/v1/customers/{id}` | GET, POST |
| Address | Customer | `/v1/customers/{id}/addresses` | GET, POST |
| Auth | Customer | `/v1/auth/login` | POST |
| Order | Order | `/v1/orders/{id}` | GET, POST |
| Order Cancel | Order | `/v1/orders/{id}/cancel` | PATCH |
| Customer Orders | Order | `/v1/customers/{id}/orders` | GET |
| Payment | Payment | `/v1/payments/{id}` | GET, POST |
| Refund | Payment | `/v1/payments/{id}/refund` | POST |
| Delivery | Delivery | `/v1/deliveries/{id}` | GET, POST |
| Tracking | Delivery | `/v1/deliveries/{id}/tracking` | GET |
| Review | Reviews | `/v1/products/{id}/reviews` | GET, POST |
| Review Average | Reviews | `/v1/products/{id}/reviews/average` | GET |

### 2. Fallback Reasoning

- **Swagger UI** is served directly by Express at `/api-docs` using `swagger-ui-express`, so it runs without a separate static server.
- **GraphQL** runs alongside REST at `/graphql` via `express-graphql`, giving clients a flexible query interface for catalogue browsing.
- **SOAP** integration is implemented with raw XML over `axios` (HTTP POST) to keep dependencies minimal; the WSDL is read at startup for contract validation.
- **Database** migrations are run on service boot via `node-pg-migrate`; for the assignment, `schema.sql` is the canonical DDL.
- **Reviews** use MongoDB because review schemas are flexible and evolve independently of the transactional core.

### 3. Q&A

**Q: Why separate Order and Payment services?**
A: The `placeOrder` saga must orchestrate payment, inventory, and delivery. Keeping Payment separate lets it scale independently and be reused by other channels (in-store, subscriptions).

**Q: Why MongoDB for Reviews?**
A: Reviews are read-heavy, schema-flexible, and non-transactional. MongoDB's document model handles arbitrary metadata (photos, helpful votes) without migrations.

**Q: How is idempotency enforced?**
A: A unique index on `idempotency_key` in each service's database. Reusing a key returns the original response without re-executing the operation.

---

## Assignment 05 — HTTP Method Semantics, Idempotency, Caching, Rate Limiting, CORS

### 1. Method Mapping Table

| Method | Semantics | Idempotent | Safe | Used For |
|--------|-----------|------------|------|----------|
| GET | Retrieve | Yes | Yes | List/get resources |
| POST | Create | No* | No | Create order, payment, login |
| PUT | Full update | Yes | No | Replace product |
| PATCH | Partial update | Yes | No | Cancel order, adjust inventory |
| DELETE | Remove | Yes | No | Delete product |
| OPTIONS | Preflight | Yes | Yes | CORS preflight |

*POST is made idempotent via the `Idempotency-Key` header.

### 2. Idempotency-Key

- All state-changing POST endpoints require `Idempotency-Key` (UUID).
- The key is stored in a unique column/index. A duplicate key returns the original `201`/`200` response.
- Header: `Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000`

### 3. ETag + If-None-Match (304)

- Responses include a weak `ETag: W/"<hash>"` computed from the JSON body (SHA-256, first 16 chars).
- On `GET`, if `If-None-Match` matches the current ETag, return `304 Not Modified` with no body.

### 4. If-Match (412 Precondition Failed)

- `PUT` and `PATCH` accept `If-Match`.
- If the provided ETag doesn't match the current resource ETag, return `412 Precondition Failed`.

### 5. X-RateLimit-* Headers

- All responses include:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 99`
  - `X-RateLimit-Reset: <epoch-seconds>`
- When exceeded, return `429 Too Many Requests` with `Retry-After: 60`.

### 6. CORS

- Preflight `OPTIONS` returns `204` with:
  - `Access-Control-Allow-Origin: <configured origin>`
  - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key, If-Match, If-None-Match`
  - `Access-Control-Max-Age: 86400`

---

## Assignment 06 — RFC 7807, AJV Validation, Content Negotiation

### 1. RFC 7807 Problem Details

All error responses use `application/problem+json`:

```json
{
  "type": "https://sweetscoop.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request body failed schema validation.",
  "instance": "/v1/orders",
  "correlationId": "corr_abc123"
}
```

### 2. AJV Body Validation (422)

- Every POST/PUT/PATCH has a JSON Schema validated by `ajv`.
- On failure, return `422 Unprocessable Entity` with field-level errors:

```json
{
  "type": "https://sweetscoop.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "errors": [
    { "field": "items", "message": "must NOT have fewer than 1 items" },
    { "field": "paymentMethod", "message": "must be equal to one of the allowed values" }
  ]
}
```

### 3. Content Negotiation (JSON & XML)

- Responses honor the `Accept` header.
- `Accept: application/json` (default) → JSON.
- `Accept: application/xml` → XML serialization of the same resource.
- Unsupported media types return `406 Not Acceptable`.

### 4. Status Codes Used (14 distinct)

| Code | Meaning | Trigger |
|------|---------|---------|
| 200 | OK | Successful GET/PUT/PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE / OPTIONS |
| 304 | Not Modified | ETag match on GET |
| 400 | Bad Request | Malformed request |
| 401 | Unauthorized | Missing/invalid JWT |
| 404 | Not Found | Resource absent |
| 406 | Not Acceptable | Unsupported Accept |
| 409 | Conflict | Duplicate / state conflict |
| 412 | Precondition Failed | If-Match mismatch |
| 422 | Unprocessable Entity | Schema validation failure |
| 429 | Too Many Requests | Rate limit exceeded |
| 502 | Bad Gateway | Downstream/SOAP failure |
| 503 | Service Unavailable | Circuit breaker open |
