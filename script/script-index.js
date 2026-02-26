let themeLink, tocList, postTime;
let allPosts = [];
let currentFetchController = null;

// Copy Buttons
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('#markdown-content pre');
    
    codeBlocks.forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return;

        pre.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerHTML = svgCopy();
        btn.title = 'Copy code';

        Object.assign(btn.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.2)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
            zIndex: '10',
            lineHeight: '0',
        });

        btn.addEventListener('click', () => {
            const code = pre.querySelector('code');
            const text = code ? code.innerText : pre.innerText;

            navigator.clipboard.writeText(text).then(() => {
                btn.innerHTML = svgCheck();
                setTimeout(() => {
                    btn.innerHTML = svgCopy();
                }, 1500);
            });
        });

        pre.appendChild(btn);
    });
}

function svgCopy() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" 
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="color:#444">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
}

function svgCheck() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" 
        fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
}

// Initialize DOM elements
function initializeElements() {
    themeLink = document.getElementById("themeStylesheet");
    postTime = document.getElementById("post-time");
    
    tocList = document.querySelector("#toc ul");
    if (!tocList) {
        const tocContainer = document.getElementById("toc");
        if (tocContainer) {
            tocList = document.createElement("ul");
            tocContainer.appendChild(tocList);
        }
    }
}

function getRandomRecommendations(currentSlug, count = 3) {
    const others = allPosts.filter(
        (p) => p.filename && p.filename.replace(".md", "") !== currentSlug
    );
    return others.sort(() => Math.random() - 0.5).slice(0, count);
}

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

function switchTheme(cssFile) {
    if (themeLink) {
        themeLink.setAttribute("href", cssFile);
        localStorage.setItem("theme", cssFile);
    }
}

function getPostFromURL() {
    const hash = window.location.hash;
    const postName = hash ? hash.substring(1) : null;
    return postName ? `/posts/${postName}.md` : null;
}

function loadMarkdown() {
    const saved = localStorage.getItem("theme");
    if (saved && themeLink) themeLink.href = saved;

    const toggleBtn = document.getElementById("toggleWidthBtn");
    const toc = document.getElementById("toc");
    const container = ensureMarkdownContainer();
    if (!container) return;

    const file = getPostFromURL();
    const main = document.querySelector("main");

    if (!file) {
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

    loadPost(file, container, main, toc, toggleBtn);
}

async function loadPost(file, container, main, toc, toggleBtn) {
    
    if (currentFetchController) {
        currentFetchController.abort();
    }
    currentFetchController = new AbortController();

    try {
        if (toggleBtn) toggleBtn.style.display = "inline-block";

        const res = await fetch(file, { 
            cache: "no-store",
            signal: currentFetchController.signal 
        });
        
        if (!res.ok) throw new Error("File not found");
        const md = await res.text();

        const { metadata, content } = extractFrontMatter(md);

        if (metadata.date && postTime) {
            const dt = parseCustomDate(metadata.date);
            
            if (dt && !isNaN(dt.getTime())) {
                postTime.textContent = `Last Update: ${dt.toLocaleString()}`;
                postTime.style.display = "block";
            } else {
                console.error("Invalid date format:", metadata.date);
                postTime.style.display = "none";
            }
        } else if (postTime) {
            postTime.style.display = "none";
        }

        const renderer = new marked.Renderer();
        renderer.code = function(code, lang) {
            const language = lang || '';
            const escaped = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            return `<pre><code class="language-${language}">${escaped}</code></pre>`;
        };
        
        marked.use({ renderer });
        const html = marked.parse(content);
        container.innerHTML = html;

        container.classList.remove("full-width");
        container.classList.add("normal-width");
        
        generateTOC();

        const currentSlug = window.location.hash.substring(1);
        renderRecommendations(currentSlug);

        if (window.Prism) Prism.highlightAll();
        addCopyButtons();

        if (main) main.style.display = "block";
        if (toc) toc.style.display = "block";

        document.querySelectorAll(".section-container section").forEach((sec) => {
            sec.style.display = "none";
        });

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Fetch aborted');
            return;
        }
        
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
    } finally {
        currentFetchController = null;
    }
}

function parseCustomDate(dateStr) {
    const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)/i);
    if (!parts) return new Date(dateStr); // Fallback
    
    let [_, year, month, day, hour, min, sec, meridiem] = parts;
    hour = parseInt(hour);
    
    if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;
    
    return new Date(`${year}-${month}-${day}T${hour.toString().padStart(2,'0')}:${min}:${sec}`);
}

function generateTOC() {
    if (!tocList) return;
    
    tocList.innerHTML = "";

    const content = document.getElementById("markdown-content");
    if (!content) return;

    const headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");
    if (headings.length === 0) return;

    const usedIds = new Set();

    headings.forEach((h) => {
        const text = h.textContent;
        let id = slugify(text);
        let counter = 1;

        while (usedIds.has(id)) {
            id = `${slugify(text)}-${counter}`;
            counter++;
        }
        
        h.id = id;
        usedIds.add(id);

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = text;
        li.appendChild(a);
        tocList.appendChild(li);

        if (h.tagName === "H2") li.style.marginLeft = "0.5em";
        if (h.tagName === "H3") li.style.marginLeft = "1em";
        if (h.tagName === "H4") li.style.marginLeft = "1.5em";
        if (h.tagName === "H5") li.style.marginLeft = "2em";
        if (h.tagName === "H6") li.style.marginLeft = "2.5em";
    });
}

function slugify(text) {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

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

window.addEventListener("hashchange", () => {
    loadMarkdown();
});

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

function categoryToId(category) {
    return category.toLowerCase().replace(/[^a-z0-9]/g, "") + "-list";
}

function formatCategoryTitle(category) {
    return category.replace(/_/g, " ");
}

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

async function renderPostLists() {
    try {
        const res = await fetch("/posts/posts.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Không thể load posts.json");

        const posts = await res.json();
        allPosts = posts;

        const createdSections = new Set();

        allPosts.forEach((post) => {
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

function addCopyIconsToSections() {
    document.querySelectorAll(".section-container section h2").forEach((h2) => {
        const slug = slugify(h2.textContent);
        h2.id = slug;

        if (h2.querySelector(".copy-link-icon")) return;

        const copyIcon = createCopyLinkIcon(slug);
        h2.appendChild(copyIcon);
    });
}

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

function toggleBackButton() {
    const btn = document.getElementById("backHome");
    if (!btn) return;
    btn.style.display = window.location.hash ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Initializing app...");
    
    initializeElements();
    
    if (window.initLibraries) {
        await window.initLibraries();
    }
    
    await renderPostLists();
    loadMarkdown();

    window.addEventListener("scroll", scrollHandler);
    
    highlightHeadingOnHash();
    toggleBackButton();
    addCopyIconsToSections();

    const toggleBtn = document.getElementById("toggleWidthBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const content = document.getElementById("markdown-content");
            const toc = document.getElementById("toc");
            if (!content) return;

            const isFocus = document.body.classList.toggle("focus-mode");

            if (isFocus) {
                content.classList.remove("normal-width");
                content.classList.add("full-width");
                toggleBtn.textContent = "Exit full screen mode";
            } else {
                content.classList.remove("full-width");
                content.classList.add("normal-width");
                toggleBtn.textContent = "Full Screen";
            }

            if (toc) {
                toc.style.display = isFocus ? "none" : "block";
            }
        });
    }
});

window.addEventListener("hashchange", () => {
    loadMarkdown();
    highlightHeadingOnHash();
    toggleBackButton();
});





