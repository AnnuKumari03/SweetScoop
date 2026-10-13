# HTTP Request/Response Log — Assignment 1

Project: Sweet Scoop coursework adapted to a public JSON API.  
Capture date: 6 October 2026.  


Five read-only `curl -i` requests were sent to JSONPlaceholder. The full captured command output (request command and all response headers/body) is in [raw-http-captures.txt](./raw-http-captures.txt).

| # | Request | Status | Content-Type | Meaning |
|---:|---|---:|---|---|
| 1 | `GET https://jsonplaceholder.typicode.com/posts/1` | 200 | `application/json; charset=utf-8` | The requested resource was returned as JSON. |
| 2 | `GET https://jsonplaceholder.typicode.com/posts/2` | 200 | `application/json; charset=utf-8` | The requested resource was returned as JSON. |
| 3 | `GET https://jsonplaceholder.typicode.com/users/1` | 200 | `application/json; charset=utf-8` | The requested resource was returned as JSON. |
| 4 | `GET https://jsonplaceholder.typicode.com/comments/1` | 200 | `application/json; charset=utf-8` | The requested resource was returned as JSON. |
| 5 | `GET https://jsonplaceholder.typicode.com/posts/999999` | 404 | `application/json; charset=utf-8` | The requested resource does not exist; the API returned an empty JSON object. |

Every request is a safe GET; none changes remote state. The API is used only as the assignment's public read-only example.
