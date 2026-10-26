# Hướng dẫn đăng bài mới (A → Z)

Ghi lại để sau này quên thì mở ra đọc lại. Toàn bộ trang chủ (hero, featured,
category, tag, filter) đều render tự động từ `posts.json` — không phải sửa
HTML/JS mỗi khi đăng bài mới.

## 1. Viết bài

- Tạo 1 file `.md` mới trong thư mục `posts/` (ngang hàng với các bài đã có).
  Tên file tuỳ bạn, không dấu, không khoảng trắng — nó sẽ trở thành URL của
  bài viết: `thewindghost.github.io/#ten-file-khong-co-duoi-md`.
- Nếu bài có ảnh, bỏ ảnh vào `posts/image-post/<ten-bai>/...` rồi chèn trong
  bài bằng markdown thường: `![Mô tả ảnh](https://thewindghost.github.io/posts/image-post/<ten-bai>/1.png)`.

### Front matter (đầu file, giữa 2 dòng `---`)

```markdown
---
date: 2025-08-16 09:30:00 PM
updated: 2025-08-20 10:00:00 AM
category: My CVEs
author: TheWindGhost
coauthors: h??? (PTIT), thD (VLUTE)
---

# Tiêu đề bài viết

Nội dung...
```

Các field này **không bắt buộc** — thiếu field nào thì phần tương ứng trên
khung thông tin đầu bài (ngày đăng / ngày cập nhật / tác giả / co-author) đơn
giản là không hiện ra:

| Field        | Hiện ở đâu                                               |
|--------------|------------------------------------------------------------|
| `date`       | Badge "Published dd/mm/yyyy"                               |
| `updated`    | Badge "Updated dd/mm/yyyy" (chỉ hiện khi có cập nhật)       |
| `category`   | Badge màu xanh (lưu ý: **khác** với `category` trong `posts.json`, xem mục 3) |
| `author`     | Dòng "Posted by ..." (mặc định là TheWindGhost nếu bỏ trống)|
| `coauthors`  | Danh sách đồng tác giả, cách nhau bằng dấu phẩy             |

→ Khuyên dùng front matter đầy đủ thay vì viết tay đoạn `> Posted by ...` ở
đầu bài như vài bài cũ — front matter sẽ tự lên khung "post-meta-card" đẹp
sẵn, viết tay sẽ bị trùng lặp thông tin.

### Nội dung bài

- `#`/`##`/`###`... tự động sinh mục lục (TOC) bên cạnh bài viết.
- Code block nhớ ghi rõ ngôn ngữ (` ```http `, ` ```python `, ` ```php `,
  ` ```js `...) để tô màu cú pháp đúng; không ghi ngôn ngữ thì hiển thị dạng
  plaintext.
- Ảnh dùng URL tuyệt đối tới GitHub Pages như ví dụ trên (không dùng đường
  dẫn tương đối).

## 2. Đăng ký bài vào `posts.json`

Mở `posts/posts.json`, thêm 1 object vào cuối mảng `posts` (thêm ở đâu trong
mảng cũng được, miễn đúng category — thứ tự bên trong 1 category là thứ tự
xuất hiện trong mảng):

```json
{
   "filename": "ten-file.md",
   "title": "Tên bug/bài viết, ngắn gọn dễ hiểu",
   "category": "My CVEs",
   "image": "",
   "tags": ["XSS"],
   "featured": false
}
```

| Field       | Ý nghĩa |
|-------------|---------|
| `filename`  | Tên file `.md` trong `posts/`. Hoặc dán nguyên URL `https://...` nếu bài viết nằm ở nơi khác (vd report trên HackerOne) — khi đó bài sẽ mở tab mới thay vì render markdown. |
| `title`     | Tên hiện trên card/listing trang chủ. **Viết ngắn gọn** — tránh lặp lại CVE-ID hay những gì đã có trong `tags` (xem ví dụ bên dưới), card dài/ngắn chênh lệch nhiều sẽ làm layout bị lệch. |
| `category`  | Quyết định bài nằm ở mục nào trên trang chủ (`/my-cves`, `/bug-bounty`...). Đây là field dùng để **nhóm bài + tính số liệu thống kê**, khác với `category` trong front matter của riêng file `.md` (chỉ hiện badge trên trang bài viết). Gõ đúng chính tả 1 category đã có để gộp chung nhóm, hoặc gõ tên mới để tự tạo mục mới. |
| `image`     | Để trống `""` nếu không có ảnh thumbnail. |
| `tags`      | Mảng tag hiện dưới mỗi bài + dùng để lọc qua nút "Filter by tag". Với bài có CVE, nên để CVE-ID là tag **đầu tiên** trong mảng (nó sẽ được dùng làm nhãn nhỏ phía trên tiêu đề nếu bài đó cũng là `featured`). |
| `featured`  | `true` → bài hiện ở khối "// featured" đầu trang chủ. Nên chỉ để `true` cho vài bài nổi bật nhất (không giới hạn số lượng trong code, nhưng để nhiều quá sẽ mất tác dụng nổi bật). |

### Ví dụ thực tế — 1 bài CVE mới

```json
{
   "filename": "cve-2026-00001.md",
   "title": "SQL Injection via Export Endpoint",
   "category": "My CVEs",
   "image": "",
   "tags": ["CVE-2026-00001", "SQL Injection"],
   "featured": true
}
```
→ Title không lặp lại "CVE-2026-00001" (đã có trong tag rồi), vừa gọn vừa
tránh card bị dài hơn hẳn các card khác trong cùng mục.

## 3. Dòng thống kê "Published: ..." ở đầu trang

Dòng này (`Published: 05 CVEs | 11 Bug Bounty Reports | 21 Write-ups`) **tự
tính** từ field `category` của tất cả bài trong `posts.json` — đăng bài mới
vào 1 category đã có là số tự tăng, không cần sửa gì thêm.

2 field cấu hình nằm ở đầu `posts.json` (ngang hàng với `posts`, không phải
trong từng bài):

```json
{
  "statsExclude": ["Automation Tools, Tips & Tricks", "Musics"],
  "statsLabels": {
    "My CVEs": "CVEs",
    "Bug Bounty": "Bug Bounty Reports",
    "Security Research (other)": "Security Research"
  },
  "posts": [ ... ]
}
```

- `statsExclude`: liệt kê đúng tên category nào **không muốn** hiện trong
  dòng thống kê (bài vẫn được tính vào tổng "Write-ups", chỉ là không có
  dòng riêng cho category đó).
- `statsLabels`: đổi tên hiển thị cho đẹp câu chữ, vd category thật là
  `"My CVEs"` nhưng muốn hiện chữ `"CVEs"` thôi. Category nào không khai báo
  ở đây thì hiện nguyên tên category.
- Tạo category hoàn toàn mới và không khai báo gì thêm → category đó mặc
  định **có** hiện trong dòng thống kê, với tên hiển thị y nguyên tên
  category.

## 4. Checklist nhanh khi đăng bài

1. [ ] Viết file `.md` trong `posts/`, có front matter (`date`, `category`,
       `author`... nếu cần).
2. [ ] Ảnh (nếu có) đã upload vào `posts/image-post/<ten-bai>/`.
3. [ ] Thêm entry vào mảng `posts` trong `posts/posts.json`: `filename`,
       `title` (gọn), `category`, `tags`, `featured`.
4. [ ] Category mới? Kiểm tra lại `statsExclude`/`statsLabels` xem có cần
       thêm label đẹp hoặc loại khỏi dòng thống kê không.
5. [ ] Mở lại trang chủ kiểm tra: card hiện đúng mục, tag hiện đúng, filter
       bấm vào tag đó ra đúng bài, featured (nếu có) hiện ở đầu trang.
