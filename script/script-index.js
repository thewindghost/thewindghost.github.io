// 1. Các biến toàn cục
const themeLink = document.getElementById("themeStylesheet");

const tocList =
    document.querySelector("#toc ul") ||
    (() => {
        const ul = document.createElement("ul");
        document.getElementById("toc")?.appendChild(ul);
        return ul;
    })();

const postTime = document.getElementById("post-time");

// ---------------------------------------------------------------------------

// Biến toàn cục lưu danh sách posts
let allPosts = [];

// Lấy 3 bài ngẫu nhiên ngoài bài hiện tại
function getRandomRecommendations(currentSlug, count = 3) {
    const others = allPosts.filter(
        (p) => p.filename.replace(".md", "") !== currentSlug,
    );
    return others.sort(() => Math.random() - 0.5).slice(0, count);
}

// ---------------------------------------------------------------------------

// Render khuyến nghị dưới footer (thủ công, không innerHTML)
function renderRecommendations(currentSlug) {
    const recs = getRandomRecommendations(currentSlug);
    const footer = document.getElementById("footer");
    const old = document.getElementById("recommendations");

    if (old) footer.removeChild(old);
    if (!recs.length) return;

    const sec = document.createElement("section");
    sec.id = "recommendations";

    const h3 = document.createElement("h2");
    h3.textContent = "Read More";
    sec.appendChild(h3);

    const ul = document.createElement("ul");
    recs.forEach((r) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${r.filename.replace(".md", "")}`;
        a.textContent = r.title;
        li.appendChild(a);
        ul.appendChild(li);
    });

    sec.appendChild(ul);
    footer.appendChild(sec);
}

// ---------------------------------------------------------------------------

// Đảm bảo có container cho Markdown
function ensureMarkdownContainer() {
    let container = document.getElementById("markdown-content");
    const main = document.querySelector("main");

    if (!container && main) {
        container = document.createElement("div");
        container.id = "markdown-content";
        main.appendChild(container);
    }
    return container;
}

// ---------------------------------------------------------------------------

// 2. Chuyển theme và lưu vào localStorage
function switchTheme(cssFile) {
    themeLink.setAttribute("href", cssFile);
    localStorage.setItem("theme", cssFile);
}

// ---------------------------------------------------------------------------

// 3. Lấy tên bài viết từ hash (#exploit => exploit.md)
function getPostFromURL() {
    const hash = window.location.hash;
    const postName = hash ? hash.substring(1) : null;
    return postName ? `/posts/${postName}.md` : null;
}

// ---------------------------------------------------------------------------

// Wait for libraries to be loaded
function waitForLibraries() {
    return new Promise((resolve) => {
        const checkLibraries = () => {
            if (window.marked && window.DOMPurify && window.Prism) {
                resolve();
            } else {
                setTimeout(checkLibraries, 50);
            }
        };
        checkLibraries();
    });
}

// ---------------------------------------------------------------------------

// 4. Load Markdown từ file .md
async function loadMarkdown() {
    // Phục hồi theme đã lưu
    const saved = localStorage.getItem("theme");
    if (saved) themeLink.href = saved;

    // Chuẩn bị toggleWidthBtn và toc
    const toggleBtn = document.getElementById("toggleWidthBtn");
    const toc = document.getElementById("toc");

    const container = ensureMarkdownContainer();
    if (!container) return;

    const file = getPostFromURL();
    const main = document.querySelector("main");

    if (!file) {
        // Không có bài viết - hiện danh sách, ẩn nội dung bài
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        // Hiện tất cả sections trong section-container
        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "block";
        });
        container.innerHTML = "";

        const oldRec = document.getElementById("recommendations");
        if (oldRec) oldRec.remove();
        document.getElementById("footer").style.display = "none";

        return;
    }

    // Wait for libraries but don't block if they're already loaded
    if (!window.marked || !window.DOMPurify) {
        await waitForLibraries();
    }

    try {
        // Hiện nút điều chỉnh kích cỡ nếu có bài
        if (toggleBtn) toggleBtn.style.display = "inline-block";

        // security cache poisoning
        const res = await fetch(file, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`File not found`);
        const md = await res.text();

        // 4.1. Parse YAML front-matter
        const { metadata, content } = extractFrontMatter(md);

        if (metadata.date) {
            const dt = new Date(metadata.date);
            postTime.textContent = `Last Update: ${dt.toLocaleString()}`;
            postTime.style.display = "block";
        } else {
            postTime.style.display = "none";
        }

        // 4.2. Render Markdown content
        const html = marked.parse(content);
        const safe = DOMPurify.sanitize(html);

        container.innerHTML = safe;
        container.classList.add("normal-width");
        container.classList.remove("full-width");
        generateTOC();

        // Chèn post footer (Read More)
        const currentSlug = window.location.hash.substring(1);
        renderRecommendations(currentSlug);

        if (window.Prism) Prism.highlightAll();

        // Có bài viết: hiện bài, hiện toc, ẩn list sections
        if (main) main.style.display = "block";
        if (toc) toc.style.display = "block";

        // Hiển thị footer chính chứa Read More
        const footerEl = document.getElementById("footer");
        if (footerEl) {
            footerEl.style.display = "block";
        }

        // Ẩn tất cả các section list bài khi đang xem bài
        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "none";
        });

    } catch (err) {
        // Khi file không tồn tại hoặc lỗi fetch - quay về trang chủ
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        // Hiện lại danh sách bài
        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "block";
        });
        container.innerHTML = `<p style="color:red;">Không tìm thấy tệp.</p>`;

        // Xóa luôn section Read More
        const oldRec2 = document.getElementById("recommendations");
        if (oldRec2) oldRec2.remove();
    }
}

// ---------------------------------------------------------------------------

// 5. Tạo TOC (Table of Contents)
function generateTOC() {
    if (!tocList) return;
    tocList.innerHTML = "";

    const content = document.getElementById("markdown-content");
    if (!content) return;

    const headings = content.querySelectorAll("h1, h2, h3");
    headings.forEach((h) => {
        const text = h.textContent;
        const id = slugify(text);
        h.id = id;

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = text;
        li.appendChild(a);
        tocList.appendChild(li);

        if (h.tagName === "H2") li.style.marginLeft = "0.5em";
        if (h.tagName === "H3") li.style.marginLeft = "1em";
    });
}

// ---------------------------------------------------------------------------

// 6. Biến heading → id friendly
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\-]+/g, "")
        .replace(/\-\-+/g, "-");
}

// ---------------------------------------------------------------------------

// 7. Hiện nút scroll to top nếu scroll xuống
function scrollHandler() {
    const btn = document.getElementById("scrollToTop");
    if (!btn) return;
    const y = window.scrollY || document.documentElement.scrollTop;
    btn.style.display = y > 200 ? "block" : "none";
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ---------------------------------------------------------------------------

// 8. Click vào TOC thì scroll đến tiêu đề
document.addEventListener("click", function(e) {
    if (e.target.tagName === "A" && e.target.closest("#toc")) {
        const targetId = e.target.getAttribute("href").substring(1);
        const el = document.getElementById(targetId);

        if (el) {
            window.scrollTo({
                top: el.offsetTop - 20,
                behavior: "smooth"
            });
            e.preventDefault();
        }
    }
});

// ---------------------------------------------------------------------------

// 9. Reload khi hash thay đổi
window.addEventListener("hashchange", loadMarkdown);

// ---------------------------------------------------------------------------

// 11. Hàm tách YAML front-matter
function extractFrontMatter(md) {
    const regex = /^---\s*[\r\n]+([\s\S]+?)[\r\n]+---/;
    const match = md.match(regex);

    let metadata = {};
    let content = md;

    if (match) {
        const yaml = match[1];
        content = md.slice(match[0].length);
        yaml.split("\n").forEach((line) => {
            const [key, ...rest] = line.split(":");
            if (key && rest.length > 0) {
                metadata[key.trim()] = rest.join(":").trim();
            }
        });
    }

    return { metadata, content };
}

// ---------------------------------------------------------------------------

function categoryToId(category) {
    return category.toLowerCase().replace(/[^a-z0-9]/g, "") + "-list";
}

// Format tên category hiển thị
function formatCategoryTitle(category) {
    return category.replace(/_/g, " ");
}

// hàm dùng chung thuộc tính của tự tạo cate mới và cate có sẵn
function createCopyLinkIcon(slug) {
    const img = document.createElement("img");
    img.src = "https://img.icons8.com/?size=20&id=1BYH0ZFsjeIy&format=png&color=000000";
    img.alt = "Copy link";
    img.className = "copy-link-icon";
    img.style.cursor = "pointer";
    img.style.marginLeft = "6px";
    img.style.width = "16px";
    img.style.height = "16px";
    img.style.verticalAlign = "middle";
    img.title = "Copy link to this section";

    img.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = `${location.origin}${location.pathname}#${slug}`;
        navigator.clipboard.writeText(url);
        img.title = "Copied!";
        setTimeout(() => {
            img.title = "Copy link to this section";
        }, 1200);
    });

    return img;
}

// Tạo section mới bên trên container chính
function createCategorySectionAtTop(category) {
    const sectionContainer = document.querySelector('.section-container');
    if (!sectionContainer) return;

    const section = document.createElement('section');
    const h2 = document.createElement('h2');
    const ul = document.createElement('ul');

    // Tạo slug và tiêu đề
    const titleText = formatCategoryTitle(category);
    const slug = slugify(titleText);
    h2.id = slug;
    h2.textContent = titleText;

    // Chèn icon link ngay sau tiêu đề
    const copyIcon = createCopyLinkIcon(slug);
    h2.appendChild(copyIcon);

    // bắt đầu từ đoạn này không được xoá, tính năng section để tự render ra post sau khi update bên posts.json
    ul.id = categoryToId(category);

    section.appendChild(h2);
    section.appendChild(ul);
    sectionContainer.appendChild(section);
}

// Hàm render chính
async function renderPostLists() {
    try {
        const res = await fetch("/posts/posts.json", {
            cache: "no-store"
        });
        if (!res.ok) throw new Error("Không thể load posts.json");

        const posts = await res.json();
        allPosts = posts;

        const createdSections = new Set();

        posts.forEach((post) => {
            const category = post.category || "Uncategorized";
            const listId = categoryToId(category);

            // Tự động tạo section cho mỗi category
            if (!createdSections.has(listId)) {
                createCategorySectionAtTop(category);
                createdSections.add(listId);
            }

            const targetList = document.getElementById(listId);
            if (!targetList) return;

            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = `#${post.filename.replace(".md", "")}`;
            a.classList.add("post-list-item");

            if (post.image) {
                const img = document.createElement("img");
                img.src = post.image;
                img.alt = post.title;
                img.classList.add("post-image");
                a.appendChild(img);

                const title = document.createElement("h3");
                title.textContent = post.title;
                a.appendChild(title);
            } else {
                a.textContent = post.title;
            }

            li.appendChild(a);
            targetList.appendChild(li);
        });
    } catch (err) {
        console.error("Lỗi load posts:", err);
    }
}

// ---------------------------------------------------------------------------

// 14. Thêm icon copy link cho các tiêu đề section tĩnh
function addCopyIconsToSections() {
    document.querySelectorAll(".section-container section h2").forEach((h2) => {
        const slug = slugify(h2.textContent);
        h2.id = slug;

        if (h2.querySelector(".copy-link-icon")) return;

        const copyIcon = createCopyLinkIcon(slug);
        h2.appendChild(copyIcon);
    });
}

// ---------------------------------------------------------------------------

// 15. Highlight section khi truy cập hash tương ứng
function highlightHeadingOnHash(slug) {
    // Xóa highlight cũ
    document
        .querySelectorAll(".section-container section h2.active-heading")
        .forEach((h2) => {
            h2.classList.remove("active-heading");
        });

    // Nếu có slug truyền vào thì dùng, không thì fallback về location.hash
    const hash = typeof slug === "string" ? slug : location.hash.substring(1);
    if (!hash) return;

    // Tìm chính xác <h2 id="hash">
    const target = document.querySelector(
        `.section-container section h2#${hash}`,
    );
    if (target) {
        target.classList.add("active-heading");
        // Scroll vào view nếu cần
        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// ---------------------------------------------------------------------------

// back về home
function toggleBackButton() {
    const btn = document.getElementById("backHome");
    if (!btn) return;
    btn.style.display = window.location.hash ? "block" : "none";
}

// ---------------------------------------------------------------------------

// 10. Khởi chạy lần đầu
document.addEventListener("DOMContentLoaded", async () => {
    await renderPostLists();
    loadMarkdown(); // Gọi sau khi danh sách load xong

    window.addEventListener("scroll", scrollHandler);
    
    // Highlight và back button
    highlightHeadingOnHash();
    toggleBackButton();
    addCopyIconsToSections();

    // Xử lý nút đổi kích thước
    const toggleBtn = document.getElementById("toggleWidthBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const content = document.getElementById("markdown-content");
            const toc = document.getElementById("toc");
            if (!content) return;

            // Chuyển đổi giữa chế độ focus mode và bình thường
            const isFocus = document.body.classList.toggle("focus-mode");

            // Clear các lớp cũ của markdown-content
            content.classList.remove("normal-width", "full-width");

            // Cập nhật text của nút
            toggleBtn.textContent = isFocus ?
                "Exit full screen mode" :
                "Full Screen";

            // Ẩn hoặc hiện TOC tùy vào chế độ focus mode
            if (toc) {
                toc.style.display = isFocus ? "none" : "block";
            }
        });
    }
});

// Event listeners cho hash change
window.addEventListener("hashchange", () => {
    highlightHeadingOnHash();
    toggleBackButton();
});

