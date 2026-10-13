# Assignment 2 — Design: Services, Contracts & Schema

Project: Sweet Scoop  
Team ID: 10.
Team Leader:Annu Kumari (20251651024)
 Team members: Prerna (20251651072); Akanksha Updahyay (20251651011)

## 1. Capabilities

Browse and search the catalogue; manage stock; register and authenticate customers; maintain delivery profiles and addresses; place and inspect orders; charge and refund payments; create and track shipments; publish product reviews; report best sellers and anonymized top buyers.

## 2. Service boundary benchmark

The six service boxes and all cross-service calls are shown in [services.drawio](./services.drawio). Each service owns its own store; foreign keys never cross a service boundary. The main implementation roles below are proposed roles, not assigned real teammates.

| Service | Data it owns | Calls to other services | Responsible member |
|---|---|---|---|
| Catalogue | Categories, products, inventory | None | To be assigned |
| Customer | Customer profiles, addresses, password hashes | None | To be assigned |
| Order | Orders, order lines, coupon definitions | Customer, Catalogue, Payment, Delivery | To be assigned |
| Payment | Payments, refund transactions | None | To be assigned |
| Delivery | Deliveries, status timeline | SOAP delivery partner | To be assigned |
| Reviews | Product review documents and rating metadata | None | To be assigned |

## 3. Consumer-facing operation contracts

The contracts expose inputs, outputs, and errors. They do not expose database tables or implementation identifiers.

### Catalogue

| Operation | Input | Output | Errors |
|---|---|---|---|
| List products | Optional category, flavor, tag, search, cursor, limit | Product summaries and next-page cursor | 400 invalid query; 422 invalid filter |
| Get product | Product resource path | Product detail and cache validator | 404 not found |
| Create product | Product name, category, price; optional tags, image, initial stock | Created product | 401 unauthorized; 409 duplicate/conflict; 422 invalid product |
| Replace product | Full product representation and optional `If-Match` | Updated product and new ETag | 401; 404; 412 stale version; 422 invalid product |
| Adjust inventory | Stock delta and reason | Current stock | 401; 404; 409 insufficient stock; 422 invalid adjustment |

### Customer

| Operation | Input | Output | Errors |
|---|---|---|---|
| Register customer | Email, password, full name, optional phone | Created profile | 409 email already used; 422 invalid profile |
| Authenticate customer | Email and password | Bearer token and profile summary | 401 invalid credentials; 422 invalid request |
| Get or update profile | Authenticated profile fields | Current or updated name, email, and phone | 401; 403 not owner; 404; 409 email conflict; 422 invalid profile |
| List addresses | Authenticated customer's profile | Address summaries | 401; 403 not owner |
| Add address | Label, street, city, state, postal code, country | Created address | 401; 403 not owner; 422 invalid address |

### Order

| Operation | Input | Output | Errors |
|---|---|---|---|
| Place order | Customer, nonempty product/quantity lines, address, payment method, optional coupon, idempotency key | Confirmed order, totals, payment and delivery references | 400 malformed JSON; 401; 402 payment declined; 409 idempotency/state conflict; 422 invalid address, item, stock, coupon, or quantity; 429; 502 dependency failure |
| Get order | Authenticated order resource | Order, line items, totals, current status | 401; 404 absent or not owned |
| List customer orders | Authenticated customer, optional cursor and limit | Order summaries and next cursor | 401; 403 not owner; 422 invalid pagination |
| Cancel order | Authenticated order resource | Cancelled status and refund result | 401; 404; 409 order is no longer cancellable; 502 compensation/dependency failure |

### Payment

| Operation | Input | Output | Errors |
|---|---|---|---|
| Process payment | Order, customer, amount, payment method, idempotency key | Payment status and reference | 402 declined; 409 duplicate/conflict; 422 invalid payment |
| Get payment | Payment resource | Payment status and amount | 404 not found |
| Refund payment | Payment resource and idempotency key | Refund status | 404; 409 already refunded or not refundable; 502 provider failure |

### Delivery

| Operation | Input | Output | Errors |
|---|---|---|---|
| Create delivery | Confirmed order, address, item summary, idempotency key | Delivery and tracking reference | 409 duplicate/conflict; 422 unsupported address; 502 partner unavailable |
| Track delivery | Delivery or order reference | Status and ordered event timeline | 404 not found |
| Update delivery status | Delivery reference and legal next status | Updated status and event | 404; 409 illegal transition; 422 invalid status |

### Reviews

| Operation | Input | Output | Errors |
|---|---|---|---|
| Post review | Product, authenticated customer, rating, optional comment | Created review | 401; 403 not author; 422 invalid rating |
| List reviews | Product and optional cursor | Review page | 422 invalid cursor; 503 review store unavailable |
| Get average | Product | Average score and review count | 503 review store unavailable |

## 4. `placeOrder` specification

**Operation:** `POST /v1/orders`  
**Purpose:** Create one customer order and coordinate payment, inventory, and delivery as a saga.

**Input:** authenticated bearer token, customer ID matching the token subject, one or more `{productId, quantity}` items where quantity is an integer ≥ 1, an address owned by the customer, a supported payment method, optional active coupon, and a required `Idempotency-Key`.

**Successful output:** `201 Created`, `Location: /v1/orders/{orderId}`, and an order representation with status, line-item snapshots, subtotal, discount, tax, total, payment reference, delivery reference, tracking link, and timestamp. A replay of the same idempotency key returns the original response without charging or reserving stock again.

**Sequence:** Validate the body; verify customer and address; retrieve each product and check stock; calculate cent-rounded totals; persist a pending order and item snapshots; call Payment; reserve stock; request delivery; persist service references; return the confirmed order.

**Compensation:** Payment failure marks the order failed. A later inventory or delivery failure requests a refund, restores only inventory successfully reserved, marks the order failed, logs the internal cause, and returns a clean gateway error. Compensation across independent services is best-effort and not an atomic distributed transaction.

**Errors:** 400 malformed JSON; 401 missing or invalid token; 402 payment declined; 409 idempotency/state conflict; 422 empty/invalid items, missing address, insufficient stock, invalid coupon, or unsupported method; 429 throttled; 502 required dependency failed.

**Hidden from callers:** service URLs, database layout, price lookup and calculation details, SOAP envelope and partner vocabulary, retry timing, circuit-breaker state, and compensation steps.

## 5. Database ownership

See [schema.drawio](./schema.drawio) for the ER view and `schema.sql` for the relational sketch. Cross-service resource references are plain identifiers; they are deliberately not foreign keys between databases. Reviews are MongoDB documents and do not share transactional tables.

## 6. Five service properties

| Service | Reachable | Self-contained | Has contract | Independent | Loosely coupled | Gap / remedy |
|---|---|---|---|---|---|---|
| Catalogue | Yes | Yes | Yes | Yes | Yes | Product/category relationship stays inside its database. |
| Customer | Yes | Yes | Yes | Yes | Yes | JWT signing key must be securely configured in production. |
| Order | Yes | Yes | Yes | Yes | Partial | Saga depends on service availability; timeouts, safe retries, and compensation are required. |
| Payment | Yes | Yes | Yes | Yes | Yes | Current providers are simulations; production needs a PCI-compliant provider. |
| Delivery | Yes | Yes | Yes | Yes | Partial | External carrier is a local stub; configure a real endpoint and credentials in production. |
| Reviews | Yes | Yes | Yes | Yes | Yes | MongoDB availability is an optional capability dependency. |
