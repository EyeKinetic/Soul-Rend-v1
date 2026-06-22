import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import './style.css';
import { databases, account, storage, APPWRITE_CONFIG, ID, Query } from './src/appwrite.js';
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

    const loadingAudio = document.getElementById('bg-audio');
    if (loadingAudio) {
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
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        screen.classList.add('hidden');
        
        const fadeToNormal = setInterval(() => {
            if (loadingAudio && loadingAudio.volume > 0.15) {
                loadingAudio.volume -= 0.05;
            } else {
                clearInterval(fadeToNormal);
                if (loadingAudio) loadingAudio.volume = 0.1;
                window.dispatchEvent(new Event('musicStarted'));
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
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
const sections = document.querySelectorAll('.view-section');



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

        const groups = document.querySelectorAll('.trello-card-group');
        groups.forEach(group => {
            const visibleCards = Array.from(group.querySelectorAll('.trello-card'))
                .filter(c => c.style.display !== 'none');
            if (visibleCards.length === 0) {
                group.style.display = 'none';
            } else {
                group.style.display = 'flex';
                if (searchWords.length > 0) {
                    group.classList.add('expanded');
                }
            }
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
let isMusicPlaying = bgAudio ? !bgAudio.paused : false;

window.addEventListener('musicStarted', () => {
    if (typeof updateAudioUI === 'function') {
        updateAudioUI(true);
    }
});

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

window.openPostViewer = function (e, id) {
    e.stopPropagation();
    const post = postsDB.find(p => p.id === id);
    if (!post) return;

    viewerTitle.textContent = post.title;
    viewerBody.innerHTML = parseMarkdown(post.content);

    let displayStr = post.date;
    try {
        const d = new Date(post.date);
        if (!isNaN(d.getTime())) {
            displayStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    } catch (err) { }
    viewerDate.textContent = displayStr;

    viewerBadge.textContent = post.badge;
    viewerBadge.className = 'badge ' + (post.badgeClass || 'dev');

    if (post.img) {
        const { cleanImg } = extractMetadata(post.img);
        let firstImg = cleanImg;
        if (firstImg.includes(',')) firstImg = firstImg.split(',')[0];

        viewerImg.src = firstImg;
        viewerImg.style.display = 'block';
        viewerImg.onerror = function () {
            this.onerror = null;
            this.src = 'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable';
        };
    } else {
        viewerImg.style.display = 'none';
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
            imgHtml = '<img src="' + encodeHTML(imgArray[0].trim()) + '" alt="Cover" style="width:100%; height:200px; object-fit:cover; border-radius:8px 8px 0 0;" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';">';
        } else if (imgArray.length > 1) {
            imgHtml = '<div class="image-carousel" data-images="' + encodeHTML(cleanImg) + '" data-current="0" style="width:100%; height:200px; border-radius:8px 8px 0 0;">\n' +
                '  <img src="' + encodeHTML(imgArray[1].trim()) + '" class="carousel-bottom" alt="Cover" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';">\n' +
                '  <img src="' + encodeHTML(imgArray[0].trim()) + '" class="carousel-top" alt="Cover" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';">\n' +
                '</div>';
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
                eventBgHtml = '' +
                '<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;">\n' +
                    '<img src="' + encodeHTML(imgArray[0]) + '" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';this.alt=\'\';">\n' +
                '</div>\n' +
                '<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8));"></div>\n';
            } else if (imgArray.length > 1) {
                eventBgHtml = '' +
                '<div class="image-carousel" data-images="' + encodeHTML(cleanImg) + '" data-current="0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; border-radius: 0;">\n' +
                    '<img src="' + encodeHTML(imgArray[1]) + '" class="carousel-bottom" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';this.alt=\'\';">\n' +
                    '<img src="' + encodeHTML(imgArray[0]) + '" class="carousel-top" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src=\'' + fallbackImg + '\';this.alt=\'\';">\n' +
                '</div>\n' +
                '<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8)); pointer-events: none;"></div>\n';
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

        return '' +
          '<div id="post-' + encodeHTML(post.id) + '" class="featured-card card event-card post-item" ' + (post.end_time ? 'data-endtime="' + encodeHTML(post.end_time) + '"' : "") + ' style="position: relative; overflow: hidden; padding: 32px; cursor: pointer; background: #0A0B10; ' + accentStyle + '" onclick="openPostViewer(event, \'' + encodeHTML(post.id) + '\')">\n' +
            eventBgHtml + '\n' +
            '<div class="card-content" style="position: relative; z-index: 5; pointer-events: none;">\n' +
              '<span class="badge ' + encodeHTML(post.badgeClass || "") + '" style="' + safeBadgeSty + '">' + safeBadgeTxt + '</span>\n' +
              '<h3 class="card-title" style="margin-top:16px">' + safeTitle + '</h3>\n' +
              '<p class="card-excerpt" style="margin-top:8px">' + safeContent + '</p>\n' +
              '<div class="event-meta" style="margin-top:24px">\n' +
                '<span class="mono" style="' + safeTimeSty + '">' + encodeHTML(timeDisplay) + '</span >\n' +
                btnHtml + '\n' +
              '</div>\n' +
            '</div>\n' +
          '</div>\n';
    }

    let defaultBtnHtml = '<button class="btn-secondary" style="margin-top: 16px; padding: 6px 12px; font-size: 12px; pointer-events: auto;">Read More</button>';
    if (meta.ctaText && meta.ctaLink) {
        defaultBtnHtml = `<a href="${encodeHTML(meta.ctaLink)}" target="_blank" rel="noopener noreferrer"><button class="btn-primary pulse" style="margin-top: 16px; padding: 6px 12px; font-size: 12px; pointer-events: auto; cursor: pointer;">${encodeHTML(meta.ctaText)}</button></a>`;
    }
    
    const cardAccent = meta.color ? `box-shadow: 0 0 15px ${encodeHTML(meta.color)}30; border: 1px solid ${encodeHTML(meta.color)}60;` : ``;

    return '' +
      '<div id="post-' + encodeHTML(post.id) + '" class="news-item card post-item" style="padding:0; overflow:hidden; cursor: pointer; ' + cardAccent + '" onclick="openPostViewer(event, \'' + encodeHTML(post.id) + '\')">\n' +
        imgHtml + '\n' +
        '<div style="padding: 20px; pointer-events: none;">\n' +
          '<div class="news-header">\n' +
            '<span class="badge ' + encodeHTML(post.badgeClass || "") + '">' + safeBadge + '</span>\n' +
            '<span class="news-meta mono">' + encodeHTML(displayDate) + '</span>\n' +
          '</div>\n' +
          '<h4 class="news-title">' + safeTitle + '</h4>\n' +
          '<p class="text-secondary" style="margin-top: 8px; white-space: pre-wrap;">' + safeContent + '</p>\n' +
          defaultBtnHtml + '\n' +
        '</div>\n' +
      '</div>\n';
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
            const column = parts[0] || "General";
            post._subcategory = parts[1] || post.title || "Untitled";
            if (!Reflect.has(boardGroups, column)) Reflect.set(boardGroups, column, []);
            Reflect.get(boardGroups, column).push(post);
        }
    });

    if (infoContainer) {
        // Load category definitions from localStorage for ordering
        let categoryDefs = [];
        try {
            categoryDefs = JSON.parse(localStorage.getItem('soulrend-info-categories') || '[]');
        } catch (e) { categoryDefs = []; }
        categoryDefs.sort((a, b) => (a.order || 0) - (b.order || 0));

        // Build a map of category name -> color from definitions
        const catColorMap = {};
        categoryDefs.forEach(cat => {
            catColorMap[cat.name.toLowerCase()] = cat.color || '#ffffff';
        });

        // Fallback color map for legacy posts
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
        const allColNames = [...orderedColNames.filter(name =>
            Object.keys(boardGroups).some(bg => bg.toLowerCase() === name.toLowerCase())
        ), ...remainingCols];

        allColNames.forEach(colName => {
            // Find the actual key in boardGroups (case-insensitive match)
            const actualKey = Object.keys(boardGroups).find(
                k => k.toLowerCase() === colName.toLowerCase()
            );
            if (!actualKey) return;

            // Determine color: check category defs first, then legacy color map
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
                        imgHtml = '<img src="' + encodeHTML(imgArray[0].trim()) + '" class="trello-card-cover" alt="Cover" onerror="this.onerror=null;this.src=\'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable\';">';
                    } else if (imgArray.length > 1) {
                        imgHtml = '' +
                        '<div class="image-carousel trello-card-cover" data-images="' + encodeHTML(cleanImg) + '" data-current="0" style="position:relative; width:100%; height:200px;">\n' +
                            '<img src="' + encodeHTML(imgArray[1].trim()) + '" class="carousel-bottom" style="height:100%; width:100%; object-fit: cover;" alt="Cover" onerror="this.onerror=null;this.src=\'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable\';">\n' +
                            '<img src="' + encodeHTML(imgArray[0].trim()) + '" class="carousel-top" style="height:100%; width:100%; object-fit: cover;" alt="Cover" onerror="this.onerror=null;this.src=\'https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable\';">\n' +
                        '</div>\n';
                    }
                }
                const safeTitle = sanitize(post.title);
                const safeContent = parseMarkdown(post.content);
                const safeBadge = sanitize(post.badge);
                const trelloCardAccent = meta.color ? `box-shadow: 0 0 10px ${encodeHTML(meta.color)}40; border-left: 3px solid ${encodeHTML(meta.color)};` : ``;
                
                return '' +
                  '<div class="trello-card post-item" id="post-' + encodeHTML(post.id) + '" style="' + trelloCardAccent + '" onclick="openPostViewer(event, \'' + encodeHTML(post.id) + '\')">\n' +
                    imgHtml + '\n' +
                    '<div style="pointer-events: none; flex: 1; display: flex; flex-direction: column;">\n' +
                        '<div class="trello-card-badge" style="color:' + encodeHTML(colorAccent) + '">' + safeBadge + '</div>\n' +
                        '<div class="trello-card-title">' + safeTitle + '</div>\n' +
                        '<div class="trello-card-excerpt">' + safeContent + '</div>\n' +
                    '</div>\n' +
                  '</div>\n';
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

            const columnHtml = '' +
              '<div class="board-column">\n' +
                '<div class="board-column-header" style="border-top: 3px solid ' + encodeHTML(colorAccent) + '">' + sanitize(actualKey) + '</div>\n' +
                cardsHtml + '\n' +
              '</div>\n';
            infoContainer.insertAdjacentHTML('beforeend', columnHtml);
        });

    }

    if (typeof updateTickingCardsCache === 'function') {
        updateTickingCardsCache();
    }
}



var tickingEventCards = [];
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
