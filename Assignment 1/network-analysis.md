# Network Analysis — Assignment 1

Page: `http://127.0.0.1:5176/` (Sweet Scoop Vite development build)  
Capture: Chromium browser request/response instrumentation with Playwright routing enabled to bypass cache.  
Viewport: 854 × 382.  
Date: 6 October 2026.


## Measured results

- Requests: 40 completed.
- Decoded response-body bytes: 3,574,088 bytes (about 3.41 MiB); this sum excludes HTTP headers and is not the compressed on-wire transfer size.
- Statuses: 40 × 200; no redirects or 4xx/5xx responses in this capture.
- Slowest resource: `https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=85` — 200, 151,153 response-body bytes, about 941 ms response-end timing.
- Other notable work: The page loaded its development JavaScript modules, fetched bestseller and anonymized buyer data from the local API, loaded Google Fonts, and requested six product images.

The browser's response-body sizes are decompressed bytes available to the page automation. They should not be presented as DevTools' compressed transfer-size column. This capture reports the exact count, bytes, slowest resource, and observed status classes required by the assignment without estimating missing metrics.

## Observations

The largest payloads are Vite development modules and icon/UI bundles; production bundling should reduce module overhead. The remote product images are the slowest individual resources in this capture. The catalogue and top-buyer calls completed successfully against the local API. A production network run should separately measure compressed bytes and HTTPS timing.
