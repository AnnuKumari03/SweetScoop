# Assignment 4 — Order Service REST Notes

Team ID: 10
Team Leader: Annu Kumari (20251651024) 
Team members: Prerna (20251651072); Akanksha Updahyay (20251651011)

Service: Order Service   
Implementation:Node.js/Express in `backend/services/order/`; the existing project stack is retained instead of introducing a duplicate Python service.

## SOAP-style starting operations

`placeOrder(customer, items, address, method)`, `getOrder(order)`, `listOrders(customer, cursor, limit)`, and `cancelOrder(order, reason)`.

## Resource table

| Method | URL | Operation | Success | Principal failures |
|---|---|---|---:|---|
| POST | `/v1/orders` | Create/place an order | 201 + `Location` | 400, 401, 402, 409, 422, 429, 502 |
| GET | `/v1/orders/{id}` | Read an owned order | 200 | 401, 404 |
| GET | `/v1/customers/{id}/orders?cursor=…&limit=…` | Filter/page a customer's orders | 200 | 401, 403, 422 |
| POST | `/v1/orders/{id}/cancel` | Cancel an eligible order (sub-resource action) | 200 | 400, 401, 404, 409, 429, 502 |

`PATCH /v1/orders/{id}/cancel` remains as a compatibility alias for existing clients. New clients should use the POST action resource and send an idempotency key.

## Hard resource choice

Cancellation is a business action rather than replacement of the whole order representation. I model it as `POST /orders/{id}/cancel`, a subordinate action resource, and rejected a verb-first route such as `/cancelOrder`. The order identifier stays in the resource path and the HTTP method communicates that the action may trigger several side effects. The existing PATCH alias is retained only to avoid breaking clients already using the original API.

## Representation and validation

The order service persists internal workflow fields and idempotency data but returns a public order representation without payment credentials, password data, or internal database columns. `validate()` in `backend/middleware/validate.js` runs AJV before the route reads the body. It enforces a nonempty item list, positive integer quantities, required customer/address/payment fields, and the payment-method enum.

## Retry and dependency policy

`requestWithRetry()` in `backend/middleware/httpClient.js` has a five-second timeout and exponential backoff with jitter. It retries transport failures and 5xx responses only for safe methods or requests carrying an `Idempotency-Key`; no 4xx response is retried. Payment, delivery, and refund creates carry deterministic idempotency keys. Inventory PATCHes are not retried without an idempotency key.

If a required payment, inventory, customer, or delivery dependency is unavailable, the order operation fails visibly rather than inventing a successful payment or shipment. The saga refunds and restores completed steps where possible, marks the order failed, logs the internal failure, and returns a sanitized 502 Problem Details response. A known delivery-address validation response is preserved as 422 after compensation; a known partner rate limit is preserved as 429 with `Retry-After`.

## Assignment comparison answers

1. The SOAP WSDL declares XML Schema message types, SOAP binding/action details, and an endpoint. OpenAPI describes HTTP resources, JSON representations, parameters, and response status codes; it does not need SOAP envelopes or SOAPAction bindings.
2. A partner `ADDRESS_NOT_SERVICEABLE` SOAP fault is translated to the Delivery API's 422 validation/availability error. The Order saga compensates completed payment/inventory steps and preserves that known 422 for its caller. `INVALID_ADDRESS` maps to 400, `RATE_LIMITED` to 429 with `Retry-After`, and partner outages/unknown codes to 502. The partner code is retained for diagnostics, but raw partner text/XML is not exposed.
3. In a modern registry, publishing is an operator/catalogue action, finding is a WSDL URL lookup, and binding is performed by the HTTP/SOAP client from the selected contract. A live UDDI server is unnecessary.
4. AJV `validate()` enforces the request schema at runtime. Without it, an absent address or a zero quantity could reach order orchestration and downstream services.
5. SOAP remains useful at the external delivery-partner edge when the partner requires a WSDL-defined schema and SOAP header contract. The guarantee is a machine-readable message/binding contract, not automatic transaction success.
