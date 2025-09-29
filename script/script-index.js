// 1. Các biến toàn cục - khởi tạo sau khi DOM ready
let themeLink, tocList, postTime;

// Biến toàn cục lưu danh sách posts
let allPosts = [];

// Initialize DOM elements
function initializeElements() {
    themeLink = document.getElementById("themeStylesheet");
    postTime = document.getElementById("post-time");
    
    // Get or create TOC list
    tocList = document.querySelector("#toc ul");
    if (!tocList) {
        const tocContainer = document.getElementById("toc");
        if (tocContainer) {
            tocList = document.createElement("ul");
            tocContainer.appendChild(tocList);
        }
    }
    
    console.log("Elements initialized:", {
        themeLink: !!themeLink,
        postTime: !!postTime,
        tocList: !!tocList
    });
}
function getRandomRecommendations(currentSlug, count = 3) {
    const others = allPosts.filter(
        (p) => p.filename.replace(".md", "") !== currentSlug,
    );
    return others.sort(() => Math.random() - 0.5).slice(0, count);
}

// Render khuyến nghị dưới main content
function renderRecommendations(currentSlug) {
    const recs = getRandomRecommendations(currentSlug);
    const main = document.querySelector("main");
    const old = document.getElementById("recommendations");

    if (old) old.remove();
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
    if (main) main.appendChild(sec);
}

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

// Chuyển theme và lưu vào localStorage
function switchTheme(cssFile) {
    if (themeLink) {
        themeLink.setAttribute("href", cssFile);
        localStorage.setItem("theme", cssFile);
    }
}

// Lấy tên bài viết từ hash
function getPostFromURL() {
    const hash = window.location.hash;
    const postName = hash ? hash.substring(1) : null;
    return postName ? `/posts/${postName}.md` : null;
}

// Wait for required libraries
function waitForLibraries() {
    return new Promise((resolve) => {
        const checkLibraries = () => {
            if (window.marked && window.Prism) {
                resolve();
            } else {
                setTimeout(checkLibraries, 50);
            }
        };
        checkLibraries();
    });
}

// Load Markdown từ file .md
function loadMarkdown() {
    // Không async ở đây để tránh lỗi
    const saved = localStorage.getItem("theme");
    if (saved) themeLink.href = saved;

    const toggleBtn = document.getElementById("toggleWidthBtn");
    const toc = document.getElementById("toc");
    const container = ensureMarkdownContainer();
    if (!container) return;

    const file = getPostFromURL();
    const main = document.querySelector("main");

    if (!file) {
        // Không có bài viết - hiện danh sách
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "block";
        });
        container.innerHTML = "";

        const oldRec = document.getElementById("recommendations");
        if (oldRec) oldRec.remove();
        return;
    }

    // Load bài viết async
    loadPost(file, container, main, toc, toggleBtn);
}

// Hàm async riêng để load post
async function loadPost(file, container, main, toc, toggleBtn) {
    try {
        // Wait for libraries
        if (!window.marked || !window.DOMPurify) {
            await waitForLibraries();
        }

        if (toggleBtn) toggleBtn.style.display = "inline-block";

        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) throw new Error("File not found");
        const md = await res.text();

        const { metadata, content } = extractFrontMatter(md);

        if (metadata.date && postTime) {
            // Clean up date string - remove extra spaces and fix PM format
            let dateStr = metadata.date.trim().replace(/\s+PM/i, ' PM').replace(/\s+AM/i, ' AM');
            const dt = new Date(dateStr);
            
            if (!isNaN(dt.getTime())) {
                postTime.textContent = `Last Update: ${dt.toLocaleString()}`;
                postTime.style.display = "block";
            } else {
                console.error("Invalid date format:", metadata.date);
                postTime.style.display = "none";
            }
        } else if (postTime) {
            postTime.style.display = "none";
        }

        const html = marked.parse(content);
        const safe = DOMPurify.sanitize(html);

        container.innerHTML = safe;
        container.classList.add("normal-width");
        container.classList.remove("full-width");
        generateTOC();

        const currentSlug = window.location.hash.substring(1);
        renderRecommendations(currentSlug);

        if (window.Prism) Prism.highlightAll();

        if (main) main.style.display = "block";
        if (toc) toc.style.display = "block";

        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "none";
        });

    } catch (err) {
        console.error("Error loading post:", err);
        
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "block";
        });
        container.innerHTML = `<p style="color:red;">Không tìm thấy tệp.</p>`;

        const oldRec = document.getElementById("recommendations");
        if (oldRec) oldRec.remove();
    }
}

// Tạo TOC
function generateTOC() {
    console.log("Generating TOC...");
    if (!tocList) {
        console.log("tocList not found");
        return;
    }
    
    tocList.innerHTML = "";

    const content = document.getElementById("markdown-content");
    if (!content) {
        console.log("markdown-content not found");
        return;
    }

    const headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");
    console.log("Found headings:", headings.length);
    
    if (headings.length === 0) {
        console.log("No headings found in markdown content");
        return;
    }

    headings.forEach((h, index) => {
        const text = h.textContent;
        const id = slugify(text);
        h.id = id;

        console.log(`Processing heading ${index}: ${text} -> #${id}`);

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = text;
        li.appendChild(a);
        tocList.appendChild(li);

        // Style based on heading level
        if (h.tagName === "H2") li.style.marginLeft = "0.5em";
        if (h.tagName === "H3") li.style.marginLeft = "1em";
        if (h.tagName === "H4") li.style.marginLeft = "1.5em";
        if (h.tagName === "H5") li.style.marginLeft = "2em";
        if (h.tagName === "H6") li.style.marginLeft = "2.5em";
    });
    
    console.log("TOC generated successfully");
}

// Slugify text
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\-]+/g, "")
        .replace(/\-\-+/g, "-");
}

// Scroll handlers
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

// TOC click handler
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

// Hash change handler - make async
window.addEventListener("hashchange", async () => {
    loadMarkdown();
});

// Extract front matter
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

// Category helpers
function categoryToId(category) {
    return category.toLowerCase().replace(/[^a-z0-9]/g, "") + "-list";
}

function formatCategoryTitle(category) {
    return category.replace(/_/g, " ");
}

// Create copy link icon
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

// Create category section
function createCategorySectionAtTop(category) {
    const sectionContainer = document.querySelector('.section-container');
    if (!sectionContainer) return;

    const section = document.createElement('section');
    const h2 = document.createElement('h2');
    const ul = document.createElement('ul');

    const titleText = formatCategoryTitle(category);
    const slug = slugify(titleText);
    h2.id = slug;
    h2.textContent = titleText;

    const copyIcon = createCopyLinkIcon(slug);
    h2.appendChild(copyIcon);

    ul.id = categoryToId(category);

    section.appendChild(h2);
    section.appendChild(ul);
    sectionContainer.appendChild(section);
}

// Render post lists
async function renderPostLists() {
    try {
        const res = await fetch("/posts/posts.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Không thể load posts.json");

        const posts = await res.json();
        allPosts = posts;

        const createdSections = new Set();

        posts.forEach((post) => {
            const category = post.category || "Uncategorized";
            const listId = categoryToId(category);

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

// Add copy icons to existing sections
function addCopyIconsToSections() {
    document.querySelectorAll(".section-container section h2").forEach((h2) => {
        const slug = slugify(h2.textContent);
        h2.id = slug;

        if (h2.querySelector(".copy-link-icon")) return;

        const copyIcon = createCopyLinkIcon(slug);
        h2.appendChild(copyIcon);
    });
}

// Highlight section on hash
function highlightHeadingOnHash(slug) {
    document.querySelectorAll(".section-container section h2.active-heading")
        .forEach((h2) => {
            h2.classList.remove("active-heading");
        });

    const hash = typeof slug === "string" ? slug : location.hash.substring(1);
    if (!hash) return;

    const target = document.querySelector(`.section-container section h2#${hash}`);
    if (target) {
        target.classList.add("active-heading");
        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// Toggle back button
function toggleBackButton() {
    const btn = document.getElementById("backHome");
    if (!btn) return;
    btn.style.display = window.location.hash ? "block" : "none";
}

// Initialize everything
document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM Content Loaded");
    
    // Initialize DOM elements first
    initializeElements();
    
    // Wait for external libraries
    await waitForLibraries();
    console.log("Libraries loaded");
    
    // Load posts and render
    await renderPostLists();
    console.log("Posts loaded");
    
    // Load current markdown if hash exists
    loadMarkdown();

    window.addEventListener("scroll", scrollHandler);
    
    highlightHeadingOnHash();
    toggleBackButton();
    addCopyIconsToSections();

    // Full screen toggle
    const toggleBtn = document.getElementById("toggleWidthBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const content = document.getElementById("markdown-content");
            const toc = document.getElementById("toc");
            if (!content) return;

            const isFocus = document.body.classList.toggle("focus-mode");
            content.classList.remove("normal-width", "full-width");
            
            toggleBtn.textContent = isFocus ?
                "Exit full screen mode" :
                "Full Screen";

            if (toc) {
                toc.style.display = isFocus ? "none" : "block";
            }
        });
    }
});

// Hash change events
window.addEventListener("hashchange", () => {
    loadMarkdown();
    highlightHeadingOnHash();
    toggleBackButton();
});
