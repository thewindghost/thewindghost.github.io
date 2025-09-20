// Global variables
const themeLink = document.getElementById("themeStylesheet");
const tocList = document.querySelector("#toc ul") || (() => {
    const ul = document.createElement("ul");
    document.getElementById("toc")?.appendChild(ul);
    return ul;
})();
const postTime = document.getElementById("post-time");

// No predefined categories - all categories are created dynamically

// Global posts array
let allPosts = [];

// Get random recommendations
function getRandomRecommendations(currentSlug, count = 3) {
    const others = allPosts.filter(p => p.filename.replace(".md", "") !== currentSlug);
    return others.sort(() => Math.random() - 0.5).slice(0, count);
}

// Render recommendations
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
    recs.forEach(r => {
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

// Ensure markdown container exists
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

// Switch theme
function switchTheme(cssFile) {
    themeLink.setAttribute("href", cssFile);
    localStorage.setItem("theme", cssFile);
}

// Get post from URL hash
function getPostFromURL() {
    const hash = window.location.hash;
    const postName = hash ? hash.substring(1) : null;
    return postName ? `/posts/${postName}.md` : null;
}

// Load markdown content
async function loadMarkdown() {
    // Restore saved theme
    const saved = localStorage.getItem("theme");
    if (saved) themeLink.href = saved;

    const toggleBtn = document.getElementById("toggleWidthBtn");
    const toc = document.getElementById("toc");
    const container = ensureMarkdownContainer();
    const main = document.querySelector("main");
    const file = getPostFromURL();

    if (!file) {
        // No post selected - show post lists
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        document.querySelectorAll("section").forEach(sec => sec.style.display = "block");
        if (container) container.innerHTML = "";

        const oldRec = document.getElementById("recommendations");
        if (oldRec) oldRec.remove();
        document.getElementById("footer").style.display = "none";
        return;
    }

    try {
        if (toggleBtn) toggleBtn.style.display = "inline-block";
        
        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) throw new Error("File not found");
        
        const md = await res.text();
        const { metadata, content } = extractFrontMatter(md);

        // Update post time
        if (metadata.date) {
            const dt = new Date(metadata.date);
            postTime.textContent = `Last Update: ${dt.toLocaleString()}`;
            postTime.style.display = "block";
        } else {
            postTime.style.display = "none";
        }

        // Render markdown
        const html = marked.parse(content);
        const safe = DOMPurify.sanitize(html);

        container.innerHTML = safe;
        container.classList.add("normal-width");
        container.classList.remove("full-width");
        
        generateTOC();

        // Show recommendations
        const currentSlug = window.location.hash.substring(1);
        renderRecommendations(currentSlug);

        if (window.Prism) Prism.highlightAll();

        // Show post content
        if (main) main.style.display = "block";
        if (toc) toc.style.display = "block";

        const footerEl = document.getElementById("footer");
        if (footerEl) footerEl.style.display = "block";

        // Hide section lists
        document.querySelectorAll(".section-container section").forEach(sec => {
            sec.style.display = "none";
        });

    } catch (err) {
        console.error("Error loading markdown:", err);
        
        if (main) main.style.display = "none";
        if (toc) toc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";

        document.querySelectorAll(".section-container section").forEach(sec => {
            sec.style.display = "block";
        });
        
        if (container) container.innerHTML = `<p style="color:red;">File not found.</p>`;

        const oldRec = document.getElementById("recommendations");
        if (oldRec) oldRec.remove();
        document.getElementById("footer").style.display = "none";
    }
}

// Generate table of contents
function generateTOC() {
    if (!tocList) return;
    tocList.innerHTML = "";

    const content = document.getElementById("markdown-content");
    if (!content) return;

    const headings = content.querySelectorAll("h1, h2, h3");
    headings.forEach(h => {
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

// Slugify text for IDs
function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\-]+/g, "")
        .replace(/\-\-+/g, "-");
}

// Scroll to top functionality
function scrollHandler() {
    const btn = document.getElementById("scrollToTop");
    if (!btn) return;
    const y = window.scrollY || document.documentElement.scrollTop;
    btn.style.display = y > 200 ? "block" : "none";
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
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

// Extract front matter from markdown
function extractFrontMatter(md) {
    const regex = /^---\s*[\r\n]+([\s\S]+?)[\r\n]+---/;
    const match = md.match(regex);

    let metadata = {};
    let content = md;

    if (match) {
        const yaml = match[1];
        content = md.slice(match[0].length);
        yaml.split("\n").forEach(line => {
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
    img.style.cssText = "cursor:pointer;margin-left:6px;width:16px;height:16px;vertical-align:middle";
    img.title = "Copy link to this section";

    img.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = `${location.origin}${location.pathname}#${slug}`;
        navigator.clipboard.writeText(url);
        img.title = "Copied!";
        setTimeout(() => img.title = "Copy link to this section", 1200);
    });

    return img;
}

// Create dynamic category section
function createCategorySectionAtTop(category) {
    const sectionContainer = document.querySelector('.section-container');
    if (!sectionContainer) {
        console.error("Section container not found");
        return;
    }

    const section = document.createElement('section');
    const h2 = document.createElement('h2');
    const ul = document.createElement('ul');

    const titleText = formatCategoryTitle(category);
    const slug = slugify(titleText);
    h2.id = slug;
    h2.textContent = titleText;

    // Add copy link icon
    const copyIcon = createCopyLinkIcon(slug);
    h2.appendChild(copyIcon);

    ul.id = categoryToId(category);

    section.appendChild(h2);
    section.appendChild(ul);
    sectionContainer.appendChild(section);
}

// Main render function
async function renderPostLists() {
    try {
        const res = await fetch("/posts/posts.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Cannot load posts.json");

        const posts = await res.json();
        allPosts = posts;

        const createdSections = new Set();

        posts.forEach(post => {
            const category = post.category || "Uncategorized";
            const listId = categoryToId(category);

            // Create dynamic section if it doesn't exist
            if (!createdSections.has(listId)) {
                createCategorySectionAtTop(category);
                createdSections.add(listId);
            }

            const targetList = document.getElementById(listId);
            if (!targetList) {
                console.warn(`List element ${listId} not found for category: ${category}`);
                return;
            }

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
        console.error("Error rendering post lists:", err);
    }
}

// Add copy icons to static sections
function addCopyIconsToSections() {
    document.querySelectorAll(".section-container section h2").forEach(h2 => {
        if (h2.querySelector(".copy-link-icon")) return;

        const slug = slugify(h2.textContent);
        h2.id = slug;

        const copyIcon = createCopyLinkIcon(slug);
        h2.appendChild(copyIcon);
    });
}

// Highlight section on hash
function highlightHeadingOnHash(slug) {
    document.querySelectorAll(".section-container section h2.active-heading")
        .forEach(h2 => h2.classList.remove("active-heading"));

    const hash = typeof slug === "string" ? slug : location.hash.substring(1);
    if (!hash) return;

    const target = document.querySelector(`.section-container section h2#${hash}`);
    if (target) {
        target.classList.add("active-heading");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

// Toggle back button
function toggleBackButton() {
    const btn = document.getElementById("backHome");
    if (btn) btn.style.display = window.location.hash ? "block" : "none";
}

// Event listeners
window.addEventListener("hashchange", () => {
    loadMarkdown();
    highlightHeadingOnHash();
    toggleBackButton();
});

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
    // Load posts first, then markdown
    await renderPostLists();
    addCopyIconsToSections();
    loadMarkdown();
    highlightHeadingOnHash();
    toggleBackButton();

    // Scroll handler
    window.addEventListener("scroll", scrollHandler);

    // Full screen toggle
    const toggleBtn = document.getElementById("toggleWidthBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const content = document.getElementById("markdown-content");
            const toc = document.getElementById("toc");
            if (!content) return;

            const isFocus = document.body.classList.toggle("focus-mode");
            content.classList.remove("normal-width", "full-width");
            
            toggleBtn.textContent = isFocus ? "Exit full screen mode" : "Full Screen";
            
            if (toc) toc.style.display = isFocus ? "none" : "block";
        });
    }
});
