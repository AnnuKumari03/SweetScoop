# Assignment 5 — HTTP Methods & Headers

## A1/A2 — Method map (verify against each mounted route)
| Action | Method + resource | Safe? | Idempotent? | Notes |
|---|---|---:|---:|---|
| List products | `GET /v1/products?category=&limit=&cursor=` | Yes | Yes | Query params filter/page; never mutate on GET. |
| Read product | `GET /v1/products/{id}` | Yes | Yes | ETag and Cache-Control apply. |
| Create order | `POST /v1/orders` | No | Not by default | Use `Idempotency-Key` so a retry returns the original result. |
| Replace product | `PUT /v1/products/{id}` | No | Yes by HTTP semantics | Same full representation should have same effect. |
| Update inventory | `PATCH /v1/products/{id}/inventory` | No | Depends on operation | Setting stock to a value may be idempotent; incrementing stock is not. |
| Delete product | `DELETE /v1/products/{id}` | No | Yes by HTTP semantics | Repeating deletion should leave resource absent. |
| Cancel order | `PATCH /v1/orders/{id}/cancel` | No | Must be designed as repeat-safe | State conflict should return 409. |
| CORS preflight | `OPTIONS /...` | Yes | Yes | Return `Allow`/CORS headers. |

## Headers table
| Operation | Request headers | Important response headers |
|---|---|---|
| Create | `Content-Type: application/json`, `Accept`, `Idempotency-Key`, optional `Authorization` | `201`, `Location`, `Content-Type`, `ETag` if representation returned |
| Read | `Accept`, optional `If-None-Match`, optional `Authorization` | `200` + `ETag` + `Cache-Control`, or `304` with no body |
| Update | `Content-Type`, `If-Match`, `Authorization` | `200` or `204`; stale ETag → `412` |
| Any rate-limited route | normal headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`; `429` includes `Retry-After` |
| Browser preflight | `Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers` | `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` |

## Safe retry plan
- `GET` is safe and idempotent; it can normally be retried after transient network errors.
- `POST /orders` is neither safe nor naturally idempotent. The `Idempotency-Key` must be stored and the original result replayed on duplicate requests.
- `If-None-Match` avoids retransmitting an unchanged representation (304).
- `If-Match` prevents overwriting a resource version that changed (412).

## Answers to the eight required questions
1. `GET /v1/products/{id}` returns 200 and an ETag; ETag allows a client to revalidate cached data. `POST /v1/orders` returns 201 with Location pointing to the created order. `DELETE /v1/products/{id}` should return 204 with no response body.
2. GET is safe and idempotent. PUT and DELETE are idempotent but not safe. POST order creation is neither by default; it is made retry-safe by storing/replaying the Idempotency-Key result.
3. An ETag such as `W/"<server-generated-value>"` must be copied from a real response. `If-None-Match: <that-value>` should return 304 if unchanged; `If-Match: "old-value"` returns 412 if the current entity tag differs. Attach real curl output; don't submit a fabricated tag as observed evidence.
4. 400 is for malformed JSON/missing required structure; 422 is syntactically valid JSON that violates domain/schema rules, e.g. quantity `0`.
5. The browser enforces CORS. The server must return a matching `Access-Control-Allow-Origin` and answer OPTIONS preflight.
6. Cache public product reads with an appropriate max-age; use `Cache-Control: no-store` for login, payment, and sensitive customer data.
7. POST may be justified for complex searches whose parameters are sensitive or too large for a URL, but it loses the ordinary GET semantics and easier intermediary caching/bookmarking.
8. On 201, Location identifies the newly created resource. On a 3xx redirect, Location identifies the redirect target.

## Evidence still required
Run `curl -v` against a running local server and paste outputs showing create + Location, idempotent repeat, 304, 412, 400, 404 and 401. Ensure OPTIONS/Allow is implemented for one resource, and update the OpenAPI file to document all request/response headers.
