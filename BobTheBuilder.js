import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import './style.css';
import { databases, account, storage, APPWRITE_CONFIG, ID, Query } from './src/appwrite.js';
import { notifyDiscordBot } from './src/discordWebhooks.js';
import DOMPurify from 'dompurify';

const sanitize = (str) => DOMPurify.sanitize(str ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
const encodeHTML = (str) => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

inject();
injectSpeedInsights();

(function initLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    const btn = document.getElementById('loading-enter-btn');
    const canvas = document.getElementById('loading-canvas');
    if (!screen || !btn || !canvas) return;

    const ctx = canvas.getContext('2d');
    let w, h;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const dots = Array.from({ length: 80 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(Math.random() * 0.6 + 0.2),
        a: Math.random() * 0.4 + 0.1,
    }));

    let rafId;
    function draw() {
        ctx.clearRect(0, 0, w, h);
        dots.forEach(d => {
            d.x += d.vx + Math.sin(d.y * 0.015) * 0.3;
            d.y += d.vy;
            if (d.y < -5) { d.y = h + 5; d.x = Math.random() * w; }
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(13,215,242,${d.a})`;
            ctx.shadowBlur = d.r * 3;
            ctx.shadowColor = '#0dd7f2';
            ctx.fill();
        });
        rafId = requestAnimationFrame(draw);
    }
    draw();

    const loadingAudio = new Audio('/bg2.mp3');
    loadingAudio.loop = true;
    loadingAudio.volume = 0.4;

    const playPromise = loadingAudio.play();
    if (playPromise !== undefined) {
        playPromise.catch(() => {
            screen.addEventListener('click', () => {
                loadingAudio.play().catch(() => {});
            }, { once: true });
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        screen.classList.add('hidden');
        
        const fadeOut = setInterval(() => {
            if (loadingAudio.volume > 0.05) {
                loadingAudio.volume -= 0.05;
            } else {
                clearInterval(fadeOut);
                loadingAudio.pause();
                loadingAudio.currentTime = 0;
            }
        }, 50);

        screen.addEventListener('transitionend', () => {
            screen.remove();
            cancelAnimationFrame(rafId);
        }, { once: true });
    });
})();

function initBackgroundAnimation() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width, height;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resize);
    resize();

    class Reishi {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height + height;
            this.size = Math.random() * 2 + 0.5;
            this.speedY = -(Math.random() * 1.5 + 0.5);
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.alpha = Math.random() * 0.5 + 0.1;
            this.color = `rgba(13, 215, 242, ${this.alpha})`;
        }

        update() {
            this.y += this.speedY;
            this.x += this.speedX;

            this.x += Math.sin(this.y * 0.02) * 0.5;

            if (this.y < -10 || this.x < -10 || this.x > width + 10) {
                this.reset();
                this.y = height + 10;
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.shadowColor = 'rgba(13, 215, 242, 0.8)';
            ctx.fill();

            if (this.size > 1.5) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();
            }
        }
    }

    const particles = [];
    for (let i = 0; i < 150; i++) {
        const p = new Reishi();
        p.y = Math.random() * height;
        particles.push(p);
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        for (const p of particles) {
            p.update();
            p.draw();
        }

        requestAnimationFrame(animate);
    }

    animate();
}

document.addEventListener('DOMContentLoaded', initBackgroundAnimation);

let postsDB = [];
let editingPostId = null;

async function loadFromAppwrite() {
    try {
        const categories = Object.keys(APPWRITE_CONFIG.collections);
        let allPosts = [];

        const promises = categories.map(async (category) => {
            const collectionId = Reflect.get(APPWRITE_CONFIG.collections, category);
            const response = await databases.listDocuments(
                APPWRITE_CONFIG.databaseId,
                collectionId,
                [
                    Query.orderDesc('$createdAt'),
                    Query.limit(100)
                ]
            );

            const docs = response.documents.map(doc => {
                let mappedDoc = {
                    id: doc.$id,
                    category: category,
                    img: doc.image || doc.img || "",
                    badgeClass: "dev",
                    createdAt: doc.$createdAt || ""
                };

                if (category === 'announcements') {
                    mappedDoc.title = doc.headline || "Untitled";
                    mappedDoc.content = doc.content || "";
                    mappedDoc.date = doc.timestamp || doc.$createdAt || "Unknown";
                    mappedDoc.badge = "ANNOUNCEMENT";
                } else if (category === 'events') {
                    mappedDoc.title = doc.event_name || "Untitled";
                    mappedDoc.content = doc.description || "";
                    mappedDoc.date = doc.start_time || doc.$createdAt || "Unknown";
                    mappedDoc.end_time = doc.end_time || null;
                    mappedDoc.badge = "EVENT";
                    mappedDoc.badgeClass = "event";
                } else if (category === 'patch-notes') {
                    mappedDoc.title = doc.version_number || "Untitled";
                    mappedDoc.content = doc.notes || "";
                    mappedDoc.date = doc.date || doc.$createdAt || "Unknown";
                    mappedDoc.badge = "PATCH NOTE";
                } else if (category === 'information') {
                    mappedDoc.title = doc.title || "Untitled";
                    mappedDoc.content = doc.content || "";
                    mappedDoc.boardColumn = doc.category || undefined;
                    mappedDoc.date = doc.$createdAt || "Unknown";
                    mappedDoc.badge = "INFO";
                    mappedDoc.badgeClass = "lore";
                }

                return mappedDoc;
            });
            return docs;
        });

        const results = await Promise.all(promises);
        results.forEach(docs => {
            allPosts = allPosts.concat(docs);
        });

        postsDB = allPosts;
        renderFeeds();

    } catch (error) {
        console.error("Failed to load posts from Appwrite:", error);
    }
}

loadFromAppwrite();

const navLinks = document.querySelectorAll('.nav-center .nav-link');
const sections = document.querySelectorAll('.view-section');

function extractMetadata(imgString) {
    if (!imgString) return { cleanImg: "", meta: {} };
    const parts = imgString.split('?metadata=');
    if (parts.length > 1) {
        try {
            return { cleanImg: parts[0], meta: JSON.parse(decodeURIComponent(parts[1])) };
        } catch(e) {}
    }
    return { cleanImg: imgString, meta: {} };
}

function parseMarkdown(text) {
    let html = encodeHTML(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary-accent); text-decoration: underline;">$1</a>');
    return html;
}

function generateMediaHtml(url, fallback, className, additionalStyle) {
    url = url.trim();
    const safeUrl = encodeHTML(url);
    const styleAttr = additionalStyle ? 'style="' + additionalStyle + '"' : '';
    const classAttr = className ? 'class="' + className + '"' : '';

    if (url.includes('tenor.com/view/')) {
        const parts = url.split('-');
        const id = parts[parts.length - 1];
        if (id && /^\d+$/.test(id)) {
            return '<iframe src="https://tenor.com/embed/' + id + '" ' + classAttr + ' ' + styleAttr + ' frameborder="0" scrolling="no" allowfullscreen pointer-events="none"></iframe>';
        }
    }
    
    if (url.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
        return '<video src="' + safeUrl + '" ' + classAttr + ' ' + styleAttr + ' autoplay loop muted playsinline></video>';
    }

    return '<img src="' + safeUrl + '" alt="Cover" ' + classAttr + ' ' + styleAttr + ' onerror="this.onerror=null;this.src=\'' + fallback + '\';this.alt=\'\';">';
}

window.deletePost = async function (id) {
    if (confirm("Are you sure you want to delete this post?")) {
        const postElement = document.getElementById(`post-${id}`);
        if (postElement) postElement.style.animation = "fadeOut 0.3s ease forwards";

        try {
            const post = postsDB.find(p => p.id === id);
            if (post) {
                const collectionId = Reflect.get(APPWRITE_CONFIG.collections, post.category);
                await databases.deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    collectionId,
                    id
                );
            }

            postsDB = postsDB.filter(post => post.id !== id);
            renderFeeds();

            if (editingPostId === id) {
                cancelEditMode();
            }

            const toastNode = document.getElementById('toast');
            if (toastNode) {
                toastNode.textContent = "Post Deleted!";
                toastNode.classList.add('delete-toast');
                toastNode.classList.add('show');
                setTimeout(() => {
                    toastNode.classList.remove('show');
                    toastNode.classList.remove('delete-toast');
                    setTimeout(() => toastNode.textContent = "Post Published!", 300);
                }, 3000);
            }
        } catch (error) {
            console.error("Failed to delete post:", error);
            alert("Error deleting post from Database.");
            if (postElement) postElement.style.animation = "";
        }
    }
}

const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

window.editPost = function (id) {
    const post = postsDB.find(p => p.id === id);
    if (!post) return;

    switchView('view-dev-portal');
    window.scrollTo(0, 0);

    document.getElementById('cms-title').value = post.title;
    document.getElementById('cms-category').value = post.category;
    document.getElementById('cms-category').dispatchEvent(new Event('change'));
    document.getElementById('cms-body').value = post.content;
    
    const { cleanImg, meta } = extractMetadata(post.img);
    document.getElementById('cms-img').value = cleanImg || '';
    
    if (document.getElementById('cms-accent-color')) document.getElementById('cms-accent-color').value = meta.color || '#0dd7f2';
    if (document.getElementById('cms-cta-text')) document.getElementById('cms-cta-text').value = meta.ctaText || '';
    if (document.getElementById('cms-cta-link')) document.getElementById('cms-cta-link').value = meta.ctaLink || '';
    document.getElementById('cms-badge').value = post.badge;
    const colorSelect = document.getElementById('cms-badge-color');
    if (colorSelect && post.badgeClass) colorSelect.value = post.badgeClass;

    if (post.category === 'events') {
        if (post.end_time) {
            const d = new Date(post.end_time);
            const pad = n => n.toString().padStart(2, '0');
            const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            document.getElementById('cms-time').value = formatted;
        } else {
            document.getElementById('cms-time').value = "";
        }
    }
    if (post.category === 'information' && post.boardColumn) {
        const parts = post.boardColumn.split('||');
        document.getElementById('cms-board-column').value = parts[0] || '';
        document.getElementById('cms-board-column').dispatchEvent(new Event('change'));
        if (parts.length > 1) {
            const subcatEl = document.getElementById('cms-subcategory');
            if (subcatEl) subcatEl.value = parts[1];
        }
    }

    editingPostId = id;
    document.getElementById('publish-btn').textContent = 'Update Post';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
}

function cancelEditMode() {
    editingPostId = null;
    document.getElementById('cms-title').value = '';
    document.getElementById('cms-category').value = 'announcements';
    document.getElementById('cms-category').dispatchEvent(new Event('change'));
    document.getElementById('cms-body').value = '';
    document.getElementById('cms-img').value = '';
    if (document.getElementById('cms-accent-color')) document.getElementById('cms-accent-color').value = '#0dd7f2';
    if (document.getElementById('cms-cta-text')) document.getElementById('cms-cta-text').value = '';
    if (document.getElementById('cms-cta-link')) document.getElementById('cms-cta-link').value = '';
    document.getElementById('cms-badge').value = '';
    const colorSelect = document.getElementById('cms-badge-color');
    if (colorSelect) colorSelect.value = 'dev';
    document.getElementById('cms-time').value = '';
    document.getElementById('cms-board-column').value = '';

    document.getElementById('publish-btn').textContent = 'Publish to Live Network';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

const cancelEditBtn = document.getElementById('cancel-edit-btn');
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEditMode);
}

const CATEGORIES_KEY = 'soulrend-info-categories';
let dragSrcIdx = null;

function loadCategories() {
    try {
        return JSON.parse(localStorage.getItem(CATEGORIES_KEY) || '[]');
    } catch (e) { return []; }
}

function saveCategories(cats) {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

function renderCategoryList() {
    const listEl = document.getElementById('category-list');
    if (!listEl) return;

    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (cats.length === 0) {
        listEl.innerHTML = '<div class="category-empty">No categories yet</div>';
        populateBoardColumnDropdown();
        return;
    }

    listEl.innerHTML = cats.map((cat, idx) => {
        const safeName = encodeHTML(cat.name);
        const safeColor = encodeHTML(cat.color || '#ffffff');
        const subcats = cat.subcategories || [];
        
        let subcatsHtml = '';
        if (subcats.length > 0) {
            subcatsHtml = '<div class="subcategory-list">' + subcats.map((sub, sIdx) => `
                <div class="subcategory-item">
                    <span class="subcat-name">${encodeHTML(sub)}</span>
                    <span class="subcat-actions">
                        <button onclick="deleteSubcategory(${idx}, ${sIdx})" title="Delete Subcategory">✕</button>
                    </span>
                </div>
            `).join('') + '</div>';
        }

        return '' +
            '<div class="category-item" draggable="true" data-cat-idx="' + idx + '">' +
                '<div class="cat-main-row">' +
                    '<span class="cat-drag-handle" title="Drag to reorder">⠿</span>' +
                    '<span class="cat-color-dot" style="background: ' + safeColor + '; color: ' + safeColor + ';"></span>' +
                    '<span class="cat-name">' + safeName + '</span>' +
                    '<span class="cat-order-badge">#' + (idx + 1) + '</span>' +
                    '<span class="cat-actions">' +
                        '<button class="cat-delete-btn" onclick="deleteCategory(' + idx + ')" title="Delete Category">✕</button>' +
                    '</span>' +
                '</div>' +
                subcatsHtml +
                '<div class="subcat-add-form">' +
                    '<input type="text" id="subcat-input-' + idx + '" placeholder="New subcategory...">' +
                    '<button onclick="addSubcategory(' + idx + ')">Add</button>' +
                '</div>' +
            '</div>';
    }).join('');

    listEl.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('dragstart', onCatDragStart);
        item.addEventListener('dragover', onCatDragOver);
        item.addEventListener('dragenter', onCatDragEnter);
        item.addEventListener('dragleave', onCatDragLeave);
        item.addEventListener('drop', onCatDrop);
        item.addEventListener('dragend', onCatDragEnd);
    });

    populateBoardColumnDropdown();
}

function onCatDragStart(e) {
    dragSrcIdx = parseInt(this.dataset.catIdx);
    this.classList.add('cat-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIdx);
}

function onCatDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function onCatDragEnter(e) {
    e.preventDefault();
    this.classList.add('cat-drag-over');
}

function onCatDragLeave() {
    this.classList.remove('cat-drag-over');
}

function onCatDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('cat-drag-over');

    const targetIdx = parseInt(this.dataset.catIdx);
    if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));

    const [moved] = cats.splice(dragSrcIdx, 1);
    cats.splice(targetIdx, 0, moved);
    cats.forEach((c, i) => { c.order = i + 1; });

    saveCategories(cats);
    renderCategoryList();
    renderFeeds();
}

function onCatDragEnd() {
    this.classList.remove('cat-dragging');
    document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
    dragSrcIdx = null;
}

function populateBoardColumnDropdown() {
    const select = document.getElementById('cms-board-column');
    if (!select) return;

    const currentVal = select.value;
    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));

    select.innerHTML = '<option value="">Select category...</option>';

    cats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '— Type custom —';
    select.appendChild(customOpt);

    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
    }

    populateSubcategoryDropdown();
}

function populateSubcategoryDropdown(selectedSub = null) {
    const catSelect = document.getElementById('cms-board-column');
    const subSelect = document.getElementById('cms-subcategory');
    if (!catSelect || !subSelect) return;

    const currentCatName = catSelect.value;
    const currentSub = selectedSub || subSelect.value;
    
    subSelect.innerHTML = '<option value="">None</option>';
    
    if (currentCatName && currentCatName !== '__custom__') {
        const cats = loadCategories();
        const cat = cats.find(c => c.name === currentCatName);
        if (cat && cat.subcategories) {
            cat.subcategories.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub;
                opt.textContent = sub;
                subSelect.appendChild(opt);
            });
        }
    }
    
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '— Type custom —';
    subSelect.appendChild(customOpt);

    if (currentSub && Array.from(subSelect.options).some(o => o.value === currentSub)) {
        subSelect.value = currentSub;
    }
}

window.addCategory = function () {
    const nameInput = document.getElementById('cat-name-input');
    const colorInput = document.getElementById('cat-color-input');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) {
        nameInput.style.borderColor = 'var(--primary-accent)';
        setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
        return;
    }

    const cats = loadCategories();

    if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert('Category "' + name + '" already exists.');
        return;
    }

    const maxOrder = cats.length > 0 ? Math.max(...cats.map(c => c.order || 0)) : 0;
    cats.push({
        name: name,
        color: colorInput ? colorInput.value : '#0dd7f2',
        order: maxOrder + 1
    });

    saveCategories(cats);
    nameInput.value = '';
    if (colorInput) colorInput.value = '#0dd7f2';
    renderCategoryList();
};

window.deleteCategory = function (idx) {
    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (idx < 0 || idx >= cats.length) return;

    if (!confirm('Delete category "' + cats[idx].name + '"? Existing posts will keep their category value.')) return;

    cats.splice(idx, 1);
    cats.forEach((c, i) => { c.order = i + 1; });
    saveCategories(cats);
    renderCategoryList();
};

window.addSubcategory = function(idx) {
    const input = document.getElementById(`subcat-input-${idx}`);
    if (!input) return;
    const subName = input.value.trim();
    if (!subName) return;

    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (idx < 0 || idx >= cats.length) return;

    if (!cats[idx].subcategories) cats[idx].subcategories = [];
    if (cats[idx].subcategories.includes(subName)) {
        alert('Subcategory already exists.');
        return;
    }

    cats[idx].subcategories.push(subName);
    saveCategories(cats);
    renderCategoryList();
};

window.deleteSubcategory = function(catIdx, subIdx) {
    const cats = loadCategories();
    cats.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (catIdx < 0 || catIdx >= cats.length) return;
    
    if (!cats[catIdx].subcategories || subIdx < 0 || subIdx >= cats[catIdx].subcategories.length) return;

    if (!confirm(`Delete subcategory "${cats[catIdx].subcategories[subIdx]}"?`)) return;

    cats[catIdx].subcategories.splice(subIdx, 1);
    saveCategories(cats);
    renderCategoryList();
};

const catAddBtn = document.getElementById('cat-add-btn');
if (catAddBtn) {
    catAddBtn.addEventListener('click', () => window.addCategory());
}

const catNameInput = document.getElementById('cat-name-input');
if (catNameInput) {
    catNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') window.addCategory();
    });
}

const boardColSelect = document.getElementById('cms-board-column');
if (boardColSelect) {
    boardColSelect.addEventListener('change', (e) => {
        populateSubcategoryDropdown();
        if (e.target.value === '__custom__') {
            const customName = prompt('Enter custom category name:');
            if (customName && customName.trim()) {
                const opt = document.createElement('option');
                opt.value = customName.trim();
                opt.textContent = customName.trim();
                const customOpt = boardColSelect.querySelector('option[value="__custom__"]');
                boardColSelect.insertBefore(opt, customOpt);
                boardColSelect.value = customName.trim();
            } else {
                boardColSelect.value = '';
            }
        }
    });
}

const subcatSelect = document.getElementById('cms-subcategory');
if (subcatSelect) {
    subcatSelect.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
            const customName = prompt('Enter custom subcategory name:');
            if (customName && customName.trim()) {
                const opt = document.createElement('option');
                opt.value = customName.trim();
                opt.textContent = customName.trim();
                const customOpt = subcatSelect.querySelector('option[value="__custom__"]');
                subcatSelect.insertBefore(opt, customOpt);
                subcatSelect.value = customName.trim();
            } else {
                subcatSelect.value = '';
            }
        }
    });
}

renderCategoryList();

function switchView(targetId) {
    _doSwitchView(targetId);
}

function _doSwitchView(targetId) {
    navLinks.forEach(l => l.classList.remove('active'));
    mobileNavLinks.forEach(l => l.classList.remove('active'));

    const targetLink = document.querySelector(`.nav-center .nav-link[data-target="${targetId}"]`);
    if (targetLink) targetLink.classList.add('active');

    const mobileTargetLink = document.querySelector(`.mobile-nav-link[data-target="${targetId}"]`);
    if (mobileTargetLink) mobileTargetLink.classList.add('active');

    sections.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }

    renderFeeds();
}

let filterTimeout;

function filterWiki(query) {
    if (filterTimeout) clearTimeout(filterTimeout);

    filterTimeout = setTimeout(() => {
        const boardCards = document.querySelectorAll('.trello-card');

        let searchWords = [];
        if (query && query.trim() !== '') {
            searchWords = query.toLowerCase().split(/\s+/);
        }

        boardCards.forEach(card => {
            let showCard = true;

            if (searchWords.length > 0) {
                const titleEl = card.querySelector('.trello-card-title');
                const excerptEl = card.querySelector('.trello-card-excerpt');
                const badgeEl = card.querySelector('.trello-card-badge');
                const colEl = card.closest('.board-column');
                const colHeader = colEl ? colEl.querySelector('.board-column-header') : null;

                const searchableText = [
                    titleEl ? titleEl.innerText : '',
                    excerptEl ? excerptEl.innerText : '',
                    badgeEl ? badgeEl.innerText : '',
                    colHeader ? colHeader.innerText : ''
                ].join(' ').toLowerCase();

                const matchesAllWords = searchWords.every(word => searchableText.includes(word));
                if (!matchesAllWords) {
                    showCard = false;
                }
            }

            card.style.display = showCard ? 'flex' : 'none';
        });

        const columns = document.querySelectorAll('.board-column');
        columns.forEach(col => {
            const visibleCards = Array.from(col.querySelectorAll('.trello-card'))
                .filter(c => c.style.display !== 'none');
            if (visibleCards.length === 0) {
                col.style.display = 'none';
            } else {
                col.style.display = 'flex';
            }
        });
    }, 150);
}

const infoSearchInput = document.getElementById('info-search');
if (infoSearchInput) {
    infoSearchInput.addEventListener('input', (e) => filterWiki(e.target.value));
}

navLinks.forEach(link => {
    link.addEventListener('click', () => switchView(link.getAttribute('data-target')));
});

mobileNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(link.getAttribute('data-target'));
        const mobileDropdown = document.getElementById('mobile-dropdown');
        if (mobileDropdown) mobileDropdown.classList.remove('active');
    });
});

const devPortal = document.getElementById('view-dev-portal');
if (devPortal) devPortal.style.display = 'none';

const postViewerModal = document.getElementById('post-viewer-modal');
const viewerClose = document.getElementById('viewer-close');
const viewerImg = document.getElementById('viewer-img');
const viewerBadge = document.getElementById('viewer-badge');
const viewerDate = document.getElementById('viewer-date');
const viewerTitle = document.getElementById('viewer-title');
const viewerBody = document.getElementById('viewer-body');

if (viewerClose) {
    viewerClose.addEventListener('click', () => {
        postViewerModal.classList.remove('active');
    });
}

window.addEventListener('click', (e) => {
    if (e.target === postViewerModal) {
        postViewerModal.classList.remove('active');
    }
    const authModal = document.getElementById('auth-modal');
    if (e.target === authModal) {
        authModal.classList.remove('active');
    }

    const mobileDropdown = document.getElementById('mobile-dropdown');
    if (mobileDropdown && e.target.id !== 'mobile-menu-btn' && !e.target.closest('#mobile-menu-btn')) {
        mobileDropdown.classList.remove('active');
    }

    const contactDropdown = document.getElementById('contact-dropdown');
    if (contactDropdown && e.target.id !== 'contact-team-btn') {
        contactDropdown.classList.remove('active');
    }

    const communityDropdown = document.getElementById('community-dropdown');
    if (communityDropdown && e.target.id !== 'community-btn') {
        communityDropdown.classList.remove('active');
    }
});

const contactTeamBtn = document.getElementById('contact-team-btn');
const contactDropdown = document.getElementById('contact-dropdown');

if (contactTeamBtn && contactDropdown) {
    contactTeamBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        contactDropdown.classList.toggle('active');
        const communityDropdown = document.getElementById('community-dropdown');
        if (communityDropdown) communityDropdown.classList.remove('active');
    });
}

const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileDropdown = document.getElementById('mobile-dropdown');

if (mobileMenuBtn && mobileDropdown) {
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileDropdown.classList.toggle('active');
        if (contactDropdown) contactDropdown.classList.remove('active');
        const communityDropdown = document.getElementById('community-dropdown');
        if (communityDropdown) communityDropdown.classList.remove('active');
    });
}

const communityBtn = document.getElementById('community-btn');
const communityDropdown = document.getElementById('community-dropdown');

if (communityBtn && communityDropdown) {
    communityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        communityDropdown.classList.toggle('active');
        if (contactDropdown) contactDropdown.classList.remove('active');
    });
}

const bgAudio = document.getElementById('bg-audio');
const musicToggleBtn = document.getElementById('music-toggle-btn');
const tracks = ['/bg1.mp3', '/bg2.mp3'];
let isMusicPlaying = false;

let currentTrackIndex = Math.floor(Math.random() * tracks.length);
if (bgAudio) {
    bgAudio.src = tracks[currentTrackIndex];
    bgAudio.volume = 0.1;
}

const playNextTrack = () => {
    let nextIndex;
    if (tracks.length > 1) {
        do {
            nextIndex = Math.floor(Math.random() * tracks.length);
        } while (nextIndex === currentTrackIndex);
    } else {
        nextIndex = 0;
    }

    currentTrackIndex = nextIndex;
    bgAudio.src = tracks[currentTrackIndex];
    bgAudio.play().catch(e => console.log("Audio play prevented:", e));
};

if (bgAudio) {
    bgAudio.addEventListener('ended', playNextTrack);
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (isMusicPlaying && bgAudio) {
            bgAudio.pause();
        }
    } else {
        if (isMusicPlaying && bgAudio) {
            bgAudio.play().catch(e => console.log("Audio play prevented on resume:", e));
        }
    }
});

const updateAudioUI = (playing) => {
    isMusicPlaying = playing;
    if (musicToggleBtn) {
        if (playing) {
            musicToggleBtn.innerHTML = '🔊 Music';
            musicToggleBtn.style.background = 'rgba(255,255,255,0.2)';
        } else {
            musicToggleBtn.innerHTML = '🔇 Music';
            musicToggleBtn.style.background = 'rgba(255,255,255,0.05)';
        }
    }
};

if (musicToggleBtn && bgAudio) {
    musicToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMusicPlaying) {
            bgAudio.pause();
            updateAudioUI(false);
        } else {
            bgAudio.play().catch(e => console.log("Audio play prevented:", e));
            updateAudioUI(true);
        }
    });
}

const playAudioOnFirstClick = (e) => {
    if (e.target.id === 'music-toggle-btn') return;
    if (!isMusicPlaying && bgAudio) {
        bgAudio.play().then(() => {
            updateAudioUI(true);
        }).catch(e => console.log("Audio autoplay prevented"));
    }
    document.removeEventListener('click', playAudioOnFirstClick);
};
document.addEventListener('click', playAudioOnFirstClick);

window.openPostViewer = function (e, postId) {
    if (e && e.target && (e.target.classList.contains('delete-btn') || e.target.classList.contains('edit-btn'))) return;

    const post = postsDB.find(p => p.id === postId);
    if (!post) return;

    viewerTitle.textContent = post.title;
    viewerBody.innerHTML = parseMarkdown(post.content);

    let displayStr = post.date;
    try {
        const d = new Date(post.date);
        if (!isNaN(d.getTime())) displayStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { }
    if (post.category === 'events' && post.end_time) {
        try {
            const ed = new Date(post.end_time);
            if (!isNaN(ed.getTime())) displayStr += ` - Ends: ${ed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
        } catch (e) { }
    }
    viewerDate.textContent = displayStr;
    viewerBadge.textContent = post.badge;
    viewerBadge.className = `badge ${post.badgeClass || 'dev'}`;

    if (post.category === 'information') {
        const colColors = {
            "Red": "#E50914",
            "Purple": "#8e44ad",
            "Blue": "#00D4FF",
            "Orange": "#F59E0B",
            "Green": "#10B981",
            "Yellow": "#FBBF24",
            "Pink": "#EC4899",
            "Cyan": "#06B6D4",
            "White": "#FFFFFF",
            "Gray": "#9CA3AF"
        };
        const lookup = Object.keys(colColors).find(k => k.toLowerCase() === (post.boardColumn || "").toLowerCase());
        const colorAccent = lookup ? colColors[lookup] : "#FFFFFF";
        viewerBadge.style.background = 'rgba(0,0,0,0.5)';
        viewerBadge.style.color = colorAccent;
    } else {
        viewerBadge.style.background = '';
        viewerBadge.style.color = '';
    }

    const viewerMediaContainer = document.getElementById('viewer-media-container');
    if (viewerMediaContainer) {
        if (post.img) {
            const { cleanImg } = extractMetadata(post.img);
            let firstImg = cleanImg;
            if (firstImg.includes(',')) firstImg = firstImg.split(',')[0];

            viewerMediaContainer.innerHTML = generateMediaHtml(firstImg, 'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable', '', 'width: 100%; height: 200px; object-fit: cover; display: block;');
            viewerMediaContainer.style.display = 'block';
        } else {
            viewerMediaContainer.style.display = 'none';
            viewerMediaContainer.innerHTML = '';
        }
    }

    postViewerModal.classList.add('active');
};

function createPostHtml(post) {
    function formatDate(dateStr) {
        if (!dateStr || dateStr === "Ongoing" || dateStr === "Unknown" || dateStr === "Just Now") return dateStr;
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    }

    let displayDate = formatDate(post.date);

    let imgHtml = '';
    const fallbackImg = "https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable";

    const { cleanImg, meta } = extractMetadata(post.img);

    const safeTitle = sanitize(post.title);
    const safeContent = parseMarkdown(post.content);
    const safeBadge = sanitize(post.badge);

    if (cleanImg) {
        const imgArray = cleanImg.split(',');
        if (imgArray.length === 1) {
            imgHtml = generateMediaHtml(imgArray[0], fallbackImg, '', 'width:100%; height:200px; object-fit:cover; border-radius:8px 8px 0 0; pointer-events: auto;');
        } else if (imgArray.length > 1) {
            imgHtml = '\n' +
            '            <div class="image-carousel" data-images="' + encodeHTML(cleanImg) + '" data-current="0" style="width:100%; height:200px; border-radius:8px 8px 0 0;">\n' +
            '                ' + generateMediaHtml(imgArray[1], fallbackImg, 'carousel-bottom', 'width:100%; height:100%; object-fit: cover;') + '\n' +
            '                ' + generateMediaHtml(imgArray[0], fallbackImg, 'carousel-top', 'width:100%; height:100%; object-fit: cover;') + '\n' +
            '            </div>\n            ';
        }
    }

    if (post.category === 'events' && cleanImg) {
        let isExpired = false;
        let timeDisplay = displayDate;

        if (post.end_time) {
            const endD = new Date(post.end_time);
            if (!isNaN(endD.getTime())) {
                const now = new Date();
                if (now > endD) {
                    isExpired = true;
                    timeDisplay = `Ended: ${formatDate(post.end_time)}`;
                } else {
                    const diffMs = endD - now;
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                    if (diffDays > 0) {
                        timeDisplay = `Ends in ${diffDays}d ${diffHours}h`;
                    } else if (diffHours > 0) {
                        timeDisplay = `Ends in ${diffHours}h`;
                    } else {
                        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        timeDisplay = `Ends in ${diffMins}m`;
                    }
                }
            } else {
                timeDisplay = `Ends: ${post.end_time}`;
            }
        }

        const badgeTxt = isExpired ? "ENDED" : post.badge;
        const badgeSty = isExpired ? "background: rgba(255,255,255,0.1); color: #888; border-color: #555;" : "";
        let btnHtml = isExpired
            ? `<button class="btn-secondary" disabled style="padding: 8px 16px; font-size: 14px; opacity: 0.5; pointer-events: auto; cursor: not-allowed;">Event Over</button>`
            : `<a href="https://discord.gg/EwgsJSPAyy" target="_blank" rel="noopener noreferrer"><button class="btn-primary pulse" style="padding: 8px 16px; font-size: 14px; pointer-events: auto; cursor: pointer;">Join Now</button></a>`;
        
        if (!isExpired && meta.ctaText && meta.ctaLink) {
            btnHtml = `<a href="${encodeHTML(meta.ctaLink)}" target="_blank" rel="noopener noreferrer"><button class="btn-primary pulse" style="padding: 8px 16px; font-size: 14px; pointer-events: auto; cursor: pointer;">${encodeHTML(meta.ctaText)}</button></a>`;
        }

        const timeSty = isExpired ? "color: #ff4a4a; font-weight: bold;" : "";

        let eventBgHtml = '';
        if (cleanImg) {
            const imgArray = cleanImg.split(',').map(s => s.trim());
            if (imgArray.length === 1) {
                eventBgHtml = `
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;">
                    ${generateMediaHtml(imgArray[0], fallbackImg, '', 'width: 100%; height: 100%; object-fit: cover;')}
                </div>
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8));"></div>
                `;
            } else if (imgArray.length > 1) {
                eventBgHtml = `
                <div class="image-carousel" data-images="${encodeHTML(cleanImg)}" data-current="0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; border-radius: 0;">
                    ${generateMediaHtml(imgArray[1], fallbackImg, 'carousel-bottom', 'width: 100%; height: 100%; object-fit: cover;')}
                    ${generateMediaHtml(imgArray[0], fallbackImg, 'carousel-top', 'width: 100%; height: 100%; object-fit: cover;')}
                </div>
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8)); pointer-events: none;"></div>
                `;
            }
        } else {
            eventBgHtml = `
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.9), rgba(10, 5, 5, 0.9)); pointer-events: none;"></div>
             `;
        }

        const safeTimeSty = timeSty.replace(/[<>"'`]/g, '');
        const safeBadgeSty = badgeSty.replace(/[<>"'`]/g, '');
        const safeBadgeTxt = sanitize(badgeTxt);
        const accentStyle = meta.color ? `box-shadow: 0 0 15px ${encodeHTML(meta.color)}40; border: 1px solid ${encodeHTML(meta.color)}80;` : `border: none;`;
        return `
      <div id="post-${post.id}" class="featured-card card event-card post-item" ${post.end_time ? `data-endtime="${post.end_time}"` : ""} style="position: relative; overflow: hidden; padding: 32px; cursor: pointer; background: #0A0B10; ${accentStyle}" onclick="openPostViewer(event, '${post.id}')">
        ${eventBgHtml}
        <button class="delete-btn" onclick="event.stopPropagation(); deletePost('${post.id}')" style="position: absolute; top: 16px; right: 16px; z-index: 20; padding: 6px 12px; font-size: 12px; background: rgba(229, 9, 20, 0.8); color: white; border: none; border-radius: 4px;">Delete Post</button>
        <button class="edit-btn btn-secondary" onclick="event.stopPropagation(); editPost('${post.id}')" style="position: absolute; top: 16px; right: 120px; z-index: 20; padding: 6px 12px; font-size: 12px; background: rgba(13, 215, 242, 0.8); color: white; border: none; border-radius: 4px;">Edit Post</button>
        <div class="card-content" style="position: relative; z-index: 5; pointer-events: none;">
          <span class="badge ${post.badgeClass}" style="${safeBadgeSty}">${safeBadgeTxt}</span>
          <h3 class="card-title" style="margin-top:16px">${safeTitle}</h3>
          <p class="card-excerpt" style="margin-top:8px">${safeContent}</p>
          <div class="event-meta" style="margin-top:24px">
            <span class="mono" style="${safeTimeSty}">${timeDisplay}</span >
            ${btnHtml}
          </div>
        </div>
      </div>
    `;
    }

    let defaultBtnHtml = '<button class="btn-secondary" style="margin-top: 16px; padding: 6px 12px; font-size: 12px; pointer-events: auto;">Read More</button>';
    if (meta.ctaText && meta.ctaLink) {
        defaultBtnHtml = `<a href="${encodeHTML(meta.ctaLink)}" target="_blank" rel="noopener noreferrer"><button class="btn-primary pulse" style="margin-top: 16px; padding: 6px 12px; font-size: 12px; pointer-events: auto; cursor: pointer;">${encodeHTML(meta.ctaText)}</button></a>`;
    }
    
    const cardAccent = meta.color ? `box-shadow: 0 0 15px ${encodeHTML(meta.color)}30; border: 1px solid ${encodeHTML(meta.color)}60;` : ``;

    return '\n' +
    '    <div id="post-' + encodeHTML(post.id) + '" class="news-item card post-item" style="padding:0; overflow:hidden; cursor: pointer; ' + cardAccent + '" onclick="openPostViewer(event, \'' + encodeHTML(post.id) + '\')">\n' +
    '      <button class="delete-btn" onclick="event.stopPropagation(); deletePost(\'' + encodeHTML(post.id) + '\')" style="position: absolute; top: 16px; right: 16px; z-index: 20; padding: 6px 12px; font-size: 12px; background: rgba(229, 9, 20, 0.8); color: white; border: none; border-radius: 4px;">Delete Post</button>\n' +
    '      <button class="edit-btn btn-secondary" onclick="event.stopPropagation(); editPost(\'' + encodeHTML(post.id) + '\')" style="position: absolute; top: 16px; right: 120px; z-index: 20; padding: 6px 12px; font-size: 12px; background: rgba(13, 215, 242, 0.8); color: white; border: none; border-radius: 4px;">Edit Post</button>\n' +
    '      ' + imgHtml + '\n' +
    '      <div style="padding: 20px; pointer-events: none;">\n' +
    '        <div class="news-header">\n' +
    '          <span class="badge ' + encodeHTML(post.badgeClass) + '">' + safeBadge + '</span>\n' +
    '          <span class="news-meta mono">' + encodeHTML(displayDate) + '</span>\n' +
    '        </div>\n' +
    '        <h4 class="news-title">' + safeTitle + '</h4>\n' +
    '        <p class="text-secondary" style="margin-top: 8px; white-space: pre-wrap;">' + safeContent + '</p>\n' +
    '        ' + defaultBtnHtml + '\n' +
    '      </div>\n' +
    '    </div>\n  ';
}

let currentActiveCategory = 'All';

function filterWikiCategory(col) {
    currentActiveCategory = col;
    const columns = document.querySelectorAll('.board-column');
    columns.forEach(column => {
        if (col === 'All') {
            column.style.display = 'flex';
        } else {
            const header = column.querySelector('.board-column-header');
            const colName = header ? header.textContent.trim() : '';
            column.style.display = colName.toLowerCase() === col.toLowerCase() ? 'flex' : 'none';
        }
    });
    const catBtns = document.querySelectorAll('.info-category-btn');
    catBtns.forEach(btn => {
        const isActive = btn.dataset.category === col;
        btn.style.borderColor = isActive ? 'var(--secondary-accent)' : 'rgba(255,255,255,0.2)';
        btn.style.background = isActive ? 'rgba(13, 215, 242, 0.2)' : 'transparent';
    });
}

function renderFeeds() {
    const containers = {
        'events': document.getElementById('events-feed-container'),
        'patch-notes': document.getElementById('patch-notes-feed-container'),
        'announcements': document.getElementById('announcements-feed-container')
    };

    Object.values(containers).forEach(container => {
        if (container) {
            const header = container.querySelector('.section-header');
            container.innerHTML = '';
            if (header) container.appendChild(header);
        }
    });

    const infoContainer = document.getElementById('information-board-container');
    if (infoContainer) infoContainer.innerHTML = '';

    const boardGroups = {};

    [...postsDB].sort((a, b) => {
        const dateA = new Date(a.createdAt || a.date).getTime();
        const dateB = new Date(b.createdAt || b.date).getTime();
        const timeA = isNaN(dateA) ? 0 : dateA;
        const timeB = isNaN(dateB) ? 0 : dateB;
        return timeB - timeA;
    }).forEach(post => {
        if (post.category !== 'information') {
            const container = Reflect.get(containers, post.category);
            if (container) {
                container.insertAdjacentHTML('beforeend', createPostHtml(post));
            }
        }
        else {
            const parts = (post.boardColumn || "General").split("||");
            const rawColumn = parts[0] || "General";
            post._subcategory = parts[1] || post.title || "Untitled";
            const existingCol = Object.keys(boardGroups).find(k => k.toLowerCase() === rawColumn.toLowerCase());
            const column = existingCol || rawColumn;
            if (!boardGroups[column]) boardGroups[column] = [];
            boardGroups[column].push(post);
        }
    });

    if (infoContainer) {
        // Load category definitions from localStorage for ordering
        let categoryDefs = loadCategories();
        categoryDefs.sort((a, b) => (a.order || 0) - (b.order || 0));

        const catColorMap = {};
        categoryDefs.forEach(cat => {
            catColorMap[cat.name.toLowerCase()] = cat.color || '#ffffff';
        });

        const colColors = {
            "Red": "#E50914",
            "Purple": "#8e44ad",
            "Blue": "#00D4FF",
            "Orange": "#F59E0B",
            "Green": "#10B981",
            "Yellow": "#FBBF24",
            "Pink": "#EC4899",
            "Cyan": "#06B6D4",
            "White": "#FFFFFF",
            "Gray": "#9CA3AF"
        };

        // Determine column order: defined categories first, then any remaining
        const orderedColNames = categoryDefs.map(c => c.name);
        const remainingCols = Object.keys(boardGroups).filter(
            colName => !orderedColNames.some(n => n.toLowerCase() === colName.toLowerCase())
        );
        let allColNames = [...orderedColNames.filter(name =>
            Object.keys(boardGroups).some(bg => bg.toLowerCase() === name.toLowerCase())
        ), ...remainingCols];

        const seenNames = new Set();
        allColNames = allColNames.filter(name => {
            const lower = name.toLowerCase();
            if (seenNames.has(lower)) return false;
            seenNames.add(lower);
            return true;
        });

        allColNames.forEach(colName => {
            const actualKey = Object.keys(boardGroups).find(
                k => k.toLowerCase() === colName.toLowerCase()
            );
            if (!actualKey) return;

            let colorAccent = catColorMap[actualKey.toLowerCase()];
            if (!colorAccent) {
                const lookup = Object.keys(colColors).find(k => k.toLowerCase() === (actualKey || "").toLowerCase());
                colorAccent = lookup ? Reflect.get(colColors, lookup) : "#ffffff";
            }

            const titleGroups = {};
            const colPosts = Reflect.get(boardGroups, actualKey);
            colPosts.forEach(post => {
                const groupName = post._subcategory || post.title || "Untitled";
                if (!Reflect.has(titleGroups, groupName)) Reflect.set(titleGroups, groupName, []);
                Reflect.get(titleGroups, groupName).push(post);
            });

            let cardsHtml = '';
            Object.keys(titleGroups).forEach(title => {
                const groupPosts = Reflect.get(titleGroups, title);
                let groupCardsHtml = groupPosts.map(post => {
                    const { cleanImg, meta } = extractMetadata(post.img);
                    let imgHtml = '';
                    if (cleanImg) {
                        const imgArray = cleanImg.split(',');
                        if (imgArray.length === 1) {
                            imgHtml = generateMediaHtml(imgArray[0], 'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable', 'trello-card-cover', '');
                        } else if (imgArray.length > 1) {
                            imgHtml = '\n' +
                            '                        <div class="image-carousel trello-card-cover" data-images="' + encodeHTML(cleanImg) + '" data-current="0" style="position:relative; width:100%; height:200px;">\n' +
                            '                            ' + generateMediaHtml(imgArray[1], 'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable', 'carousel-bottom', 'height:100%; width:100%; object-fit: cover;') + '\n' +
                            '                            ' + generateMediaHtml(imgArray[0], 'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable', 'carousel-top', 'height:100%; width:100%; object-fit: cover;') + '\n' +
                            '                        </div>\n                        ';
                        }
                    }
                    const trelloCardAccent = meta.color ? `box-shadow: 0 0 10px ${encodeHTML(meta.color)}40; border-left: 3px solid ${encodeHTML(meta.color)};` : ``;
                    const safeTrelloContent = parseMarkdown(post.content);
                    return '\n' +
                    '                  <div class="trello-card post-item" id="post-' + encodeHTML(post.id) + '" style="' + trelloCardAccent + '" onclick="openPostViewer(event, \'' + encodeHTML(post.id) + '\')">\n' +
                    '                    <button class="delete-btn" style="position:absolute; top:4px; right:4px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="event.stopPropagation(); deletePost(\'' + encodeHTML(post.id) + '\')">Delete</button>\n' +
                    '                    <button class="edit-btn btn-secondary" style="position:absolute; top:4px; right:52px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="event.stopPropagation(); editPost(\'' + encodeHTML(post.id) + '\')">Edit</button>\n' +
                    '                    ' + imgHtml + '\n' +
                    '                    <div style="pointer-events: none; flex: 1; display: flex; flex-direction: column;">\n' +
                    '                        <div class="trello-card-badge" style="color:' + encodeHTML(colorAccent) + '">' + encodeHTML(post.badge) + '</div>\n' +
                    '                        <div class="trello-card-title">' + encodeHTML(post.title) + '</div>\n' +
                    '                        <div class="trello-card-excerpt">' + safeTrelloContent + '</div>\n' +
                    '                    </div>\n' +
                    '                  </div>\n                ';
                }).join('');

                const isExpanded = groupPosts.length === 1 ? 'expanded' : '';
                const displayChevron = groupPosts.length > 1 ? '<span style="font-size: 10px; margin-left: 4px;">▼</span>' : '';

                cardsHtml += '' +
                  '<div class="trello-card-group ' + isExpanded + '">\n' +
                    '<div class="trello-card-group-header" onclick="this.parentElement.classList.toggle(\'expanded\')">\n' +
                        '<span class="group-title" style="color: ' + encodeHTML(colorAccent) + '; flex: 1; margin-right: 8px;">' + sanitize(title) + '</span>\n' +
                        '<span class="group-count">' + groupPosts.length + ' post' + (groupPosts.length !== 1 ? 's' : '') + ' ' + displayChevron + '</span>\n' +
                    '</div>\n' +
                    '<div class="trello-card-group-content">\n' +
                        groupCardsHtml + '\n' +
                    '</div>\n' +
                  '</div>\n';
            });

            const columnHtml = `
              <div class="board-column">
                <div class="board-column-header" style="border-top: 3px solid ${encodeHTML(colorAccent)}">${encodeHTML(actualKey)}</div>
                ${cardsHtml}
              </div>
            `;
            infoContainer.insertAdjacentHTML('beforeend', columnHtml);
        });

        const catContainer = document.getElementById('info-categories');
        if (catContainer) {
            catContainer.innerHTML = '';

            const cols = ['All', ...allColNames];

            cols.forEach(col => {
                const btn = document.createElement('button');
                btn.className = 'info-category-btn btn-secondary';
                btn.dataset.category = col;
                btn.style.padding = '4px 12px';
                btn.style.fontSize = '12px';
                btn.style.borderRadius = '20px';
                btn.style.borderColor = col === currentActiveCategory ? 'var(--secondary-accent)' : 'rgba(255,255,255,0.2)';
                btn.style.color = '#fff';
                btn.style.background = col === currentActiveCategory ? 'rgba(13, 215, 242, 0.2)' : 'transparent';
                btn.textContent = col;

                btn.onclick = () => filterWikiCategory(col);
                catContainer.appendChild(btn);
            });
        }
    }

    if (typeof updateTickingCardsCache === 'function') {
        updateTickingCardsCache();
    }
}


const authModal = document.getElementById('auth-modal');
const openDevAuthBtn = document.getElementById('open-dev-auth');
const cancelAuthBtn = document.getElementById('auth-cancel');
const submitAuthBtn = document.getElementById('auth-submit');
const emailInput = document.getElementById('dev-email');
const passwordInput = document.getElementById('dev-password');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-dev-btn');

let inactivityTimer;
const INACTIVITY_LIMIT = 5 * 60 * 1000;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (document.body.classList.contains('dev-mode')) {
        inactivityTimer = setTimeout(async () => {
            try {
                await account.deleteSession('current');
            } catch (error) {
                console.error("Auto-logout error:", error);
            }
            document.body.classList.remove('dev-mode');
            switchView('view-announcements');
            alert("Session expired due to inactivity.");
        }, INACTIVITY_LIMIT);
    }
}

window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);
window.addEventListener('scroll', resetInactivityTimer);

async function checkSession() {
    try {
        await account.get();
        // Session exists — go straight to dev portal
        document.body.classList.add('dev-mode');
        switchView('view-dev-portal');
        return;
    } catch (e) {
        // No active session — show login modal
    }

    document.body.classList.remove('dev-mode');
    authModal.classList.add('active');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (authError) authError.style.display = 'none';

    const devPortal = document.getElementById('view-dev-portal');
    if (devPortal) devPortal.style.display = 'none';
}
checkSession();

if (cancelAuthBtn) {
    cancelAuthBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
}

let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60 * 1000;
let lockoutUntil = 0;

async function authenticate() {
    const now = Date.now();
    if (now < lockoutUntil) {
        const secsLeft = Math.ceil((lockoutUntil - now) / 1000);
        authError.textContent = `Too many failed attempts. Try again in ${secsLeft}s.`;
        authError.style.display = 'block';
        return;
    }

    submitAuthBtn.textContent = 'Logging in...';
    submitAuthBtn.disabled = true;
    authError.style.display = 'none';

    try {
        await account.createEmailPasswordSession(
            emailInput.value,
            passwordInput.value
        );

        loginAttempts = 0;
        authModal.classList.remove('active');
        document.body.classList.add('dev-mode');
        switchView('view-dev-portal');

    } catch (error) {
        loginAttempts++;
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            lockoutUntil = Date.now() + LOCKOUT_DURATION;
            loginAttempts = 0;
            authError.textContent = `Too many failed attempts. Locked out for 60 seconds.`;
        } else {
            const remaining = MAX_LOGIN_ATTEMPTS - loginAttempts;
            authError.textContent = `${error.message || 'Invalid credentials.'} (${remaining} attempt${remaining !== 1 ? 's' : ''} left)`;
        }
        authError.style.display = 'block';
        passwordInput.value = '';
        if (emailInput) emailInput.focus();
    } finally {
        submitAuthBtn.textContent = 'Authenticate';
        submitAuthBtn.disabled = false;
    }
}

if (submitAuthBtn) submitAuthBtn.addEventListener('click', authenticate);
if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') authenticate();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await account.deleteSession('current');
        } catch (error) {
            console.error("Logout error:", error);
        }
        document.body.classList.remove('dev-mode');
        window.location.href = '/index.html';
    });
}


const publishBtn = document.getElementById('publish-btn');
const inputTitle = document.getElementById('cms-title');
const inputCategory = document.getElementById('cms-category');
const inputTime = document.getElementById('cms-time');
const inputTimeGroup = document.getElementById('cms-time-group');
const inputBoardGroup = document.getElementById('cms-board-column-group');
const inputBoardCol = document.getElementById('cms-board-column');
const inputBadge = document.getElementById('cms-badge');
const inputBadgeColor = document.getElementById('cms-badge-color');
const inputImg = document.getElementById('cms-img');
const inputImgFile = document.getElementById('cms-img-file');
const inputBody = document.getElementById('cms-body');
const toastNode = document.getElementById('toast');

let selectedImageFiles = [];

if (inputImgFile) {
    inputImgFile.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            selectedImageFiles = Array.from(this.files);
            inputImg.value = `Selected: ${selectedImageFiles.length} file(s)`;

        } else {
            selectedImageFiles = [];
        }
    });
}


if (inputCategory) {
    inputCategory.addEventListener('change', (e) => {
        if (e.target.value === 'events') {
            inputTimeGroup.style.display = 'block';
            if (inputBoardGroup) inputBoardGroup.style.display = 'none';
        } else if (e.target.value === 'information') {
            inputTimeGroup.style.display = 'none';
            if (inputBoardGroup) inputBoardGroup.style.display = 'block';
        } else {
            inputTimeGroup.style.display = 'none';
            if (inputBoardGroup) inputBoardGroup.style.display = 'none';
        }
    });
}

if (publishBtn) {
    publishBtn.addEventListener('click', () => {
        const title = inputTitle.value.trim();
        const category = inputCategory.value;
        const body = inputBody.value.trim();
        const img = inputImg.value.trim();

        if (!title || !body) {
            alert("Please enter a Title and Body content.");
            return;
        }

        let badgeTxt = inputBadge && inputBadge.value.trim() ? inputBadge.value.trim() : "UPDATE";
        let badgeCls = inputBadgeColor ? inputBadgeColor.value : "dev";
        let finalDate = "Just Now";

        if (category === "announcements" && (!inputBadge || !inputBadge.value.trim())) badgeTxt = "ANNOUNCEMENT";
        if (category === "events") {
            if (!inputBadge || !inputBadge.value.trim()) badgeTxt = "EVENT";
            finalDate = inputTime.value.trim() || "Ongoing";
        }
        if (category === "patch-notes" && (!inputBadge || !inputBadge.value.trim())) badgeTxt = "PATCH NOTE";
        if (category === "information" && (!inputBadge || !inputBadge.value.trim())) badgeTxt = "INFO";

        let customBoardCol = "General";
        if (category === "information" && inputBoardCol && inputBoardCol.value.trim()) {
            customBoardCol = inputBoardCol.value.trim();
            const inputSubcat = document.getElementById('cms-subcategory');
            if (inputSubcat && inputSubcat.value && inputSubcat.value !== "") {
                customBoardCol += "||" + inputSubcat.value.trim();
            }
        }

        let payload = {};

        if (category === 'announcements') {
            payload = {
                headline: title,
                content: body,
                timestamp: finalDate !== "Just Now" ? finalDate : new Date().toISOString(),
                ...(img && { image: img })
            };
        }
        else if (category === 'events') {
            let endTimeVal = null;
            if (inputTime && inputTime.value) {
                try {
                    endTimeVal = new Date(inputTime.value).toISOString();
                } catch (e) { }
            }

            let startTimeVal = new Date().toISOString();
            if (editingPostId) {
                const existing = postsDB.find(p => p.id === editingPostId);
                if (existing && existing.date && existing.date !== "Unknown") startTimeVal = existing.date;
            }

            payload = {
                event_name: title,
                description: body,
                start_time: startTimeVal,
                end_time: endTimeVal,
                active: true,
                ...(img && { image: img })
            };
        }
        else if (category === 'patch-notes') {
            payload = {
                version_number: title,
                notes: body,
                date: finalDate !== "Just Now" ? finalDate : new Date().toISOString(),
                ...(img && { image: img })
            };
        }
        else if (category === 'information') {
            payload = {
                title: title,
                content: body,
                category: customBoardCol || "General",
                ...(img && { image: img })
            };
        }

        const submitData = async () => {
            publishBtn.textContent = "Publishing...";
            publishBtn.disabled = true;
            try {
                let finalImageUrl = img;

                if (selectedImageFiles && selectedImageFiles.length > 0) {
                    publishBtn.textContent = `Uploading ${selectedImageFiles.length} Image(s)...`;

                    const uploadPromises = selectedImageFiles.map(async (file) => {
                        const uploadedFile = await storage.createFile(
                            APPWRITE_CONFIG.bucketId,
                            ID.unique(),
                            file
                        );
                        return storage.getFileView(APPWRITE_CONFIG.bucketId, uploadedFile.$id);
                    });

                    const newUrls = await Promise.all(uploadPromises);

                    if (img && !img.startsWith('Selected: ')) {
                        finalImageUrl = img + ',' + newUrls.join(',');
                    } else {
                        finalImageUrl = newUrls.join(',');
                    }

                    payload.image = finalImageUrl;
                } else if (img && img.startsWith('Selected: ')) {
                    finalImageUrl = "";
                    payload.image = "";
                }

                let meta = {};
                const accentColor = document.getElementById('cms-accent-color') ? document.getElementById('cms-accent-color').value : null;
                const ctaText = document.getElementById('cms-cta-text') ? document.getElementById('cms-cta-text').value.trim() : "";
                const ctaLink = document.getElementById('cms-cta-link') ? document.getElementById('cms-cta-link').value.trim() : "";
                if (accentColor && accentColor !== "#0dd7f2") meta.color = accentColor;
                if (ctaText) meta.ctaText = ctaText;
                if (ctaLink) meta.ctaLink = ctaLink;

                if (Object.keys(meta).length > 0) {
                    const metaStr = "?metadata=" + encodeURIComponent(JSON.stringify(meta));
                    finalImageUrl = finalImageUrl ? finalImageUrl + metaStr : metaStr;
                    payload.image = finalImageUrl;
                }

                const localPostData = {
                    ...payload,
                    category,
                    title: title,
                    date: category === 'events' && payload.start_time ? payload.start_time : (finalDate !== "Just Now" ? finalDate : new Date().toISOString()),
                    end_time: category === 'events' ? payload.end_time : null,
                    badge: badgeTxt,
                    badgeClass: badgeCls,
                    img: finalImageUrl,
                    boardColumn: customBoardCol
                };

                if (editingPostId) {
                    const postIndex = postsDB.findIndex(p => p.id === editingPostId);
                    const oldCategory = postIndex !== -1 ? postsDB[postIndex].category : category;

                    if (oldCategory !== category) {
                        await databases.deleteDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[oldCategory], editingPostId);
                        const newDoc = await databases.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], ID.unique(), payload);
                        if (postIndex !== -1) postsDB[postIndex] = { ...localPostData, id: newDoc.$id };
                        if (category !== 'information') notifyDiscordBot("UPDATE", postsDB[postIndex]);
                    } else {
                        await databases.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], editingPostId, payload);
                        if (postIndex !== -1) postsDB[postIndex] = { ...postsDB[postIndex], ...localPostData };
                        if (category !== 'information') notifyDiscordBot("UPDATE", postsDB[postIndex]);
                    }

                    editingPostId = null;
                } else {
                    const newDoc = await databases.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], ID.unique(), payload);
                    const newPost = { ...localPostData, id: newDoc.$id };
                    postsDB.push(newPost);
                    if (category !== 'information') notifyDiscordBot("CREATE", newPost);
                }

                selectedImageFiles = [];
                if (inputImgFile) inputImgFile.value = "";

                renderFeeds();
                cancelEditMode();

                if (toastNode) {
                    toastNode.classList.add('show');
                    setTimeout(() => {
                        toastNode.classList.remove('show');
                    }, 3000);
                }
            } catch (error) {
                console.error("Appwrite publish error:", error);
                alert("Failed to publish to global database. Check console for details.");
            } finally {
                publishBtn.textContent = editingPostId ? "Update Post" : "Publish to Live Network";
                publishBtn.disabled = false;
            }
        };

        submitData();
    });
}

document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tag = e.target.getAttribute('data-tag');
        if (!tag) return;

        if (inputBody) {
            inputBody.value += ` ${tag} `;
            inputBody.focus();
        }
    });
});

let tickingEventCards = [];
function updateTickingCardsCache() {
    tickingEventCards = Array.from(document.querySelectorAll('.event-card[data-endtime]'));
}

updateTickingCardsCache();

setInterval(() => {
    if (tickingEventCards.length === 0) return;

    const now = new Date();

    tickingEventCards.forEach((card, index) => {
        const endTimeStr = card.getAttribute('data-endtime');
        if (!endTimeStr) return;

        const endD = new Date(endTimeStr);
        if (isNaN(endD.getTime())) return;

        const timeSpan = card.querySelector('.event-meta .mono');

        if (now > endD) {
            card.removeAttribute('data-endtime');

            tickingEventCards.splice(index, 1);

            const badgeSpan = card.querySelector('.card-content .badge');
            if (badgeSpan) {
                badgeSpan.textContent = "ENDED";
                badgeSpan.style.background = "rgba(255,255,255,0.1)";
                badgeSpan.style.color = "#888";
                badgeSpan.style.borderColor = "#555";
            }

            const btn = card.querySelector('.event-meta button:not(.btn-secondary:not([disabled]))');
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Event Over";
                btn.className = "btn-secondary";
                btn.style.opacity = "0.5";
                btn.style.cursor = "not-allowed";
            }

            if (timeSpan) {
                timeSpan.textContent = `Ended: ${endD.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
                timeSpan.style.color = "#ff4a4a";
                timeSpan.style.fontWeight = "bold";
            }
        } else {
            const diffMs = endD - now;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

            let timeDisplay = "";
            if (diffDays > 0) {
                timeDisplay = `Ends in ${diffDays}d ${diffHours}h`;
            } else if (diffHours > 0) {
                timeDisplay = `Ends in ${diffHours}h ${diffMins}m`;
            } else if (diffMins > 0) {
                timeDisplay = `Ends in ${diffMins}m ${diffSecs}s`;
            } else {
                timeDisplay = `Ends in ${diffSecs}s`;
            }

            if (timeSpan && timeSpan.textContent !== timeDisplay) {
                timeSpan.textContent = timeDisplay;
            }
        }
    });
}, 1000);

let carouselElements = [];
function updateCarouselCache() {
    carouselElements = Array.from(document.querySelectorAll('.image-carousel'));
}
const originalUpdateTickingCardsCache = updateTickingCardsCache;
updateTickingCardsCache = () => {
    if (typeof originalUpdateTickingCardsCache === 'function') originalUpdateTickingCardsCache();
    updateCarouselCache();
};
updateCarouselCache();

setInterval(() => {
    if (carouselElements.length === 0) return;

    carouselElements.forEach(carousel => {
        const rawImages = carousel.getAttribute('data-images');
        if (!rawImages) return;

        const images = rawImages.split(',');
        if (images.length <= 1) return;

        let currentIndex = parseInt(carousel.getAttribute('data-current') || '0', 10);
        const topImg = carousel.querySelector('.carousel-top');
        const bottomImg = carousel.querySelector('.carousel-bottom');

        if (!topImg || !bottomImg) return;

        const nextIndex = (currentIndex + 1) % images.length;

        bottomImg.src = images[nextIndex];

        topImg.style.opacity = '0';

        setTimeout(() => {
            topImg.src = images[nextIndex];

            topImg.style.transition = 'none';
            topImg.style.opacity = '1';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    topImg.style.transition = 'opacity 0.5s ease-in-out';
                });
            });

            carousel.setAttribute('data-current', nextIndex);
        }, 500);
    });
}, 4000);

const bgSlides = ['/image.png', '/Copy_of_goat.png', '/gat_1.png'];
let bgCurrentIndex = 0;


setInterval(() => {
    const topSlide = document.getElementById('bg-slide-top');
    const bottomSlide = document.getElementById('bg-slide-bottom');
    if (!topSlide || !bottomSlide) return;

    const nextIndex = (bgCurrentIndex + 1) % bgSlides.length;

    bottomSlide.style.backgroundImage = `url('${bgSlides[nextIndex]}')`;
    bottomSlide.style.opacity = '0.3';

    topSlide.style.opacity = '0';

    setTimeout(() => {
        topSlide.style.transition = 'none';
        topSlide.style.backgroundImage = `url('${bgSlides[nextIndex]}')`;
        topSlide.style.opacity = '0.3';

        setTimeout(() => {
            topSlide.style.transition = 'opacity 1.5s ease-in-out';
        }, 50);

        bgCurrentIndex = nextIndex;
    }, 1500);
}, 8000);
