# Assignment 4 — Rebuild One Service as REST

Chosen service: Order Service, aligned with the Assignment 6 requirement to continue with Orders.  
Team ID: 10
Team Leader:Annu Kumari(20251651024)
Team members: Prerna (20251651072); Akanksha Updahyay (20251651011);

The working implementation remains in [`backend/services/order`](../../backend/services/order/index.js), with its shared validation, auth, idempotency, HTTP resilience, and error middleware in `backend/middleware/`. Focused executable tests are in `backend/tests/checkout.test.js`, `backend/tests/httpClient.test.js`, and `backend/tests/httpSemantics.test.js`. The canonical contract is [`../../openapi.yaml`](../../openapi.yaml); an assignment snapshot is stored here.

## Deliverables

- `openapi.yaml` — contract snapshot with status codes, schemas, and Location header.
- `NOTES.md` — resource table, hard-choice reasoning, fallback, and comparison answers.
- `curl-transcript.txt` — captured HTTP request/response checks (generated after the local flow).
- `validation.txt` — OpenAPI validator output.
- Final suite results: [`../test-results.txt`](../test-results.txt).
- Run tests from the backend using `npm test`; this project uses Jest/Supertest rather than pytest because it is implemented in Node.js.
