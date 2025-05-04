---
date: 2025-05-04 10:15:00
---

# SSRF-induced Cache Poisoning Logic Bug

Hi, today I will share about the `Cache Poisoning (Variant)` vulnerability that I accidentally encountered on `BugCrowd`. Alright, let's get started!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---

## 1. Analyzing the Cache Poisoning Vulnerability via Server-Side Request Forgery?

Alright, why do I say that? Perhaps you might be curious: this vulnerability originated from discovering a `Proxy Controller Endpoint`, so I was able to POC `SSRF`, but it was only rated `P5 Informational` because the `Program` defines that `SSRF` that only interacts with external services or with the `Server Attacker` is considered `Low-Impact`. Therefore, they suggested that I should find a way to increase its `Impact` so they could reevaluate it!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---

## 2. How Was Cache Poisoning Discovered?

During the POC of `SSRF`, a collaborator discovered that it forced the use of the following `Response Header`: `image/svg+xml`. Previously, when sending the `Request` for it to `Fetch` to the Web Attacker, I set it to `text/html`, so it always returned a 400. Therefore, he tried various `Response Header` values, and after success, when using `image/svg+xml`, it returned status 200.

- Here, using `text/html` returns status 400

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

- And here, using `image/svg+xml`

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

Pay attention to the `Content-Type` in the second line of the `Response Header`—it accepts `image/svg+xml`. If you look closely, you can see in the fourth image, at the end of the `Response Header`, that it has saved the `Cache` to `CloudFront` with the `Response Header` `X-Cache: Hit from cloudfront` and the most important part is still `Age: 5`. This means it really was saved to the cache. And another important point is that this is truly a `variant` I encountered for the first time, because normally `Cache Poisoning` will not save to the cache through a `Fetch` to the `Server Attacker`.

Note: I used https://requestrepo.com/#/requests to modify the `Response Header`

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---

## 3. How Can I Properly Prove to the Vendor that This Is Genuine Cache Poisoning

Of course, I have to show them how I attack a user via `Cache Poisoning`!

I have the following `Payload`:

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

This `Payload` is used to perform an `Open Redirect` attack to the `Server Attacker`, which may sound `low-impact`. But what really matters to them is how this `Payload` is saved into the cache and causes mass attacks!

Note: Some of you may have been wondering how I injected the `Payload`, because the `SSRF` vulnerability performed a `Fetch` to the `Server Attacker` and brought the entire `Payload` from my `Poc.xml` file back in the `Response` from the server.

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/6.png)

---

## 4. The Real Cache Poisoning POC!

Maybe that's completely done? Well, yes, it's definitely done, but how do I confirm to them that it's truly serious?

I moved to a `VPS Server` to dig deeper. I wrote a web application using `Python Flask` as follows to escalate the impact from `P4 -> P3`:

---
```python
- Code to add
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
- Request in Repeater
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

An important point here is when I look at the `Logs` of the `Server Attacker`, I see that I sent the `Request` more than 10 times to the `Server`, but it only appears 2 times in the `Logs`. This means that the `Server` truly has a `Logic Bug` here, not just a typical `Cache Poisoning` vulnerability, because clearly this is a `Fetch` feature that then stores the response in the `CloudFront` cache, but the developer accidentally allowed it to `Fetch` external `Data`, thus causing the `Cache Poisoning` bug!

![alt text](/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

## 5. Diagram and Detailed Explanation

### + Differentiation from “Standard” Cache Poisoning

- **Standard Cache Poisoning**  
  1. Attacker sends a request with a payload directly from the client.  
  2. Server or CDN embeds the payload in the response.  
  3. CDN caches the response and returns it to subsequent clients.  
  4. Main work: manipulate headers (`Host`, `Vary`, `Cache-Control`…) to control different cache keys.

- **This Logic Bug Variant**  
  1. **Intermediate is SSRF/Fetch**  
     - Payload (SVG/XML) is fetched from the **server attacker**, not from the victim's browser.  
  2. **Main server** accidentally allows the `Fetch` to return the response with the header `Content-Type: image/svg+xml`, so **CloudFront automatically caches**.  
  3. **Repeated logic**: after caching, even if the victim makes multiple requests, the request is no longer forwarded to SSRF; it still returns the old cache—embedding the attacker's payload in the response.

---

### + Why Call It a “Logic Bug” Instead?

1. **Flow design flaw** rather than just misconfiguration of the cache.  
2. **Server attacker** is allowed to fetch any URL and return it directly to the CDN.  
3. The **Fetch → Cache → Serve** flow lacks controls (domain whitelist, response header validation…), allowing SSRF to escalate into cache poisoning.  
4. More severe consequences: not only incorrect caching, but also **mass-targeted attacks** via SVG/redirect payloads, XSS, malicious file downloads.

---

### + Flow diagram

![alt text](https://mermaid.ink/img/pako:eNp9kV9PwjAUxb9Kcw1viIx_gz6YwBCMYmLEoHHzoWyXrbFrsXQGJfvudgUMJsY-9d7fOec2tzuIVYJAoVbbcckNJbtIEhKByTDHCKi9JrhihTAR1E_QgmnOlgI3lcZ5KrRS0sz518Ho9dbbg-sIn5CnmdnjpRLJCTa4NYESSu_pWdOdE4HgEv8VYJLijC1RjFj8lmpVSJtPrXLlTgSVsIxkWdZqkUw1W2dk9lA1h-GCx488fyXn55fkJnzA9wI3Zl-OwkCoIplo-_7XSn0VzlF_oCZDY-wk1HvdbXjHBI-5Kjbkd0BlGrlrcLC6nMC1xuG9VttPMkETZ2TMDHNw7OB1GExIwOIMyU-4w9cOT09GzhfTi-e7maNTR4dQh1TzBKjRBdYhR52zqoQ_Ppnpt2pBpfWsmXxRKj_a7CLTDOiKiY2tinXCDI45s_vLf7oaZYI6sCs3QNt-14UA3cEWaN9r9Pp-p9dp-l3fG3gWflpRq9Xo9Hyv3ep3297A98s6fLmpzUbf75bfvnzLWw)
