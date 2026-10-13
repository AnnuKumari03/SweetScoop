# Assignment 6 — Honest Responses, Status Codes, Errors & Validation

## Status map for Orders (intended contract; reconcile with actual handler responses)
| Endpoint | Success | Failure outcomes |
|---|---|---|
| `POST /v1/orders` | 201 + `Location: /v1/orders/{id}` | 400 malformed JSON; 401 missing/invalid auth if protected; 409 idempotency/state conflict; 422 invalid items/quantity/address; 502/503 dependency failure |
| `GET /v1/orders/{id}` | 200 | 404 unknown order; 406 unsupported Accept |
| `PATCH /v1/orders/{id}/cancel` | 200/204 | 404 unknown order; 409 order cannot be cancelled in current state; 422 domain rule refusal |
| `DELETE /v1/products/{id}` | 204 | 404 unknown product; 409 if referenced/blocked |

## Problem Details shape
All errors should be returned as `Content-Type: application/problem+json` and share this shape:
```json
{
  "type": "/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "errors": [
    {"field": "items", "message": "must contain at least one item"},
    {"field": "addressId", "message": "is required"}
  ]
}
```
The `errors` array is an extension for field-level validation. Use stable types such as `empty-cart`, `item-unavailable`, `payment-declined`, `order-not-found`, and `illegal-transition`.

## 400 vs 422 example
- **400:** request body is not valid JSON, e.g. `{"items":`.
- **422:** valid JSON but invalid domain data, e.g. `{"items":[{"productId":"ice-1","quantity":0}],"addressId":"addr-1"}`.

## Internal errors
Catch database/provider exceptions server-side, log diagnostic detail with a correlation ID, and return a mapped problem response. Never return stack traces, SQL messages, secrets, or partner SOAP internals to the client.

## Content negotiation
- `Accept: application/json` → JSON response with `Content-Type: application/json; charset=utf-8`.
- `Accept: application/xml` → XML if the service supports conversion; otherwise return `406 Not Acceptable`.
- All response bodies, including errors, must have an explicit Content-Type.

## Retry safety
Retry only transient network/5xx errors with bounded attempts and backoff. Do not automatically retry an unchanged 4xx. `429` and `503` should include `Retry-After` when a meaningful retry delay is available. A POST order retry must reuse its original Idempotency-Key.

## Answers to the seven required questions
1. For every endpoint, use the status map above as the intended map, then confirm exact outcomes with curl; explain each status in one line in the final submission.
2. Stable error types: `empty-cart` (no items), `item-unavailable` (stock cannot be reserved), `payment-declined` (provider declines), `order-not-found` (unknown ID), `illegal-transition` (cancel after shipment/delivery).
3. The Problem Details example above labels `type`, `title`, `status`, and `detail`; `errors` identifies each invalid field.
4. A 422 with two errors is shown above (`items` empty and `addressId` missing); capture the actual service response for final evidence.
5. GET is safe to retry. POST order creation is retry-safe only with idempotency storage/replay. `429`/`503` may be retried after `Retry-After`; a 4xx should not be blindly retried unchanged.
6. Map internal PostgreSQL/provider exceptions to generic 500/502/503 problem responses; hide SQL, stack trace, connection string and SOAP fault details.
7. JSON/XML should represent the same order data when XML is supported; show the exact `Accept` headers and both live responses, otherwise demonstrate 406 for XML.

## Evidence still required
`transcript.txt` must contain actual `curl -i` results for success, empty cart, quantity <= 0, unknown ID, illegal transition, rate limit and XML negotiation. Re-run idempotency and timeout tests after changes. Do not claim evidence that has not been captured.
