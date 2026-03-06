import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import './style.css';
import { databases, account, storage, APPWRITE_CONFIG, ID, Query } from './src/appwrite.js';

// Initialize Vercel Analytics tracking
inject();
injectSpeedInsights();

// Initialize Vercel Analytics tracking
inject();
injectSpeedInsights();

// --- Background Reishi Canvas Animation ---
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

    // Particle class for Bleach-themed "Reishi" (spirit energy)
    class Reishi {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height + height; // Start slightly below screen
            this.size = Math.random() * 2 + 0.5;
            this.speedY = -(Math.random() * 1.5 + 0.5); // Float upwards
            this.speedX = (Math.random() - 0.5) * 0.5; // Slight horizontal drift
            // Create a soul/cyan glow color
            this.alpha = Math.random() * 0.5 + 0.1;
            // Reishi are typically cyan/blue tinted in Bleach
            this.color = `rgba(13, 215, 242, ${this.alpha})`;
        }

        update() {
            this.y += this.speedY;
            this.x += this.speedX;

            // Add a slight shimmer/sway effect
            this.x += Math.sin(this.y * 0.02) * 0.5;

            // Reset particle logic when it goes off screen (top or sides)
            if (this.y < -10 || this.x < -10 || this.x > width + 10) {
                this.reset();
                this.y = height + 10; // Start at bottom again
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.shadowColor = 'rgba(13, 215, 242, 0.8)';
            ctx.fill();

            // Core bright center for larger particles
            if (this.size > 1.5) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();
            }
        }
    }

    const particles = [];
    // Depending on performance, adjust particle count. 100 for a subtle effect
    for (let i = 0; i < 150; i++) {
        particles.push(new Reishi());
        // Scatter initial Y positions so they don't all spawn at the bottom at once
        particles[i].y = Math.random() * height;
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
        }

        requestAnimationFrame(animate);
    }

    animate();
}

// Call on load
document.addEventListener('DOMContentLoaded', initBackgroundAnimation);

let postsDB = [];
let editingPostId = null;

async function loadFromAppwrite() {
    try {
        const categories = Object.keys(APPWRITE_CONFIG.collections);
        let allPosts = [];

        // Fetch from all collections concurrently
        const promises = categories.map(async (category) => {
            const collectionId = APPWRITE_CONFIG.collections[category];
            const response = await databases.listDocuments(
                APPWRITE_CONFIG.databaseId,
                collectionId,
                [
                    Query.orderDesc('$createdAt'),
                    Query.limit(100)
                ]
            );

            // Map Appwrite documents to our frontend structure
            const docs = response.documents.map(doc => {
                let mappedDoc = {
                    id: doc.$id,
                    category: category,
                    img: doc.image || doc.img || "",
                    badgeClass: "dev",
                    createdAt: doc.$createdAt || "" // Always store for reliable sorting
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
                    mappedDoc.end_time = doc.end_time || null; // Captured from DB for expiration logic
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

// Initial Load
loadFromAppwrite();

// --- Navigation Logic ---
const navLinks = document.querySelectorAll('.nav-center .nav-link');
const sections = document.querySelectorAll('.view-section');

// Attach delete to window so inline onclick can see it
window.deletePost = async function (id) {
    if (confirm("Are you sure you want to delete this post?")) {
        const postElement = document.getElementById(`post-${id}`);
        if (postElement) postElement.style.animation = "fadeOut 0.3s ease forwards";

        try {
            const post = postsDB.find(p => p.id === id);
            if (post) {
                const collectionId = APPWRITE_CONFIG.collections[post.category];
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

// Helpers for entering/exiting edit mode
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

window.editPost = function (id) {
    const post = postsDB.find(p => p.id === id);
    if (!post) return;

    // Switch view to dev portal to see the form
    switchView('view-dev-portal');
    window.scrollTo(0, 0);

    // Populate form fields
    document.getElementById('cms-title').value = post.title;
    document.getElementById('cms-category').value = post.category;
    document.getElementById('cms-category').dispatchEvent(new Event('change')); // trigger toggle
    document.getElementById('cms-body').value = post.content;
    document.getElementById('cms-img').value = post.img || '';
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
        document.getElementById('cms-board-column').value = post.boardColumn;
    }

    // Set UI state
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

function switchView(targetId) {
    _doSwitchView(targetId);
}

function _doSwitchView(targetId) {
    navLinks.forEach(l => l.classList.remove('active'));
    mobileNavLinks.forEach(l => l.classList.remove('active'));

    // Update desktop nav
    const targetLink = document.querySelector(`.nav-center .nav-link[data-target="${targetId}"]`);
    if (targetLink) targetLink.classList.add('active');

    // Update mobile nav
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

    // Re-render feed when a view switches
    renderFeeds();
}

// Trello / Information Board Filter logic
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

            // Text check (Multi-word substring match against title, excerpt, badge, and column name)
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

                // Ensure EVERY word typed is found somewhere in the searchable text
                const matchesAllWords = searchWords.every(word => searchableText.includes(word));
                if (!matchesAllWords) {
                    showCard = false;
                }
            }

            card.style.display = showCard ? 'flex' : 'none';
        });

        // Hide columns that have absolutely no visible cards
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
    }, 150); // 150ms debounce
}

// Wire up search input via JS (not inline oninput, which can't see module-scoped functions)
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

// --- Post Viewer Modal Logic ---
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

// Window click outside modal to close
window.addEventListener('click', (e) => {
    if (e.target === postViewerModal) {
        postViewerModal.classList.remove('active');
    }
    // Also handle dev auth modal
    const authModal = document.getElementById('auth-modal');
    if (e.target === authModal) {
        authModal.classList.remove('active');
    }

    // Close mobile dropdown if clicking anywhere else
    const mobileDropdown = document.getElementById('mobile-dropdown');
    if (mobileDropdown && e.target.id !== 'mobile-menu-btn' && !e.target.closest('#mobile-menu-btn')) {
        mobileDropdown.classList.remove('active');
    }

    // Close footer dropdown if clicking anywhere else
    const contactDropdown = document.getElementById('contact-dropdown');
    if (contactDropdown && e.target.id !== 'contact-team-btn') {
        contactDropdown.classList.remove('active');
    }

    const communityDropdown = document.getElementById('community-dropdown');
    if (communityDropdown && e.target.id !== 'community-btn') {
        communityDropdown.classList.remove('active');
    }
});

// --- Contact Team Dropdown Logic ---
const contactTeamBtn = document.getElementById('contact-team-btn');
const contactDropdown = document.getElementById('contact-dropdown');

if (contactTeamBtn && contactDropdown) {
    contactTeamBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent window click
        contactDropdown.classList.toggle('active');
        // Close community dropdown if it's open
        const communityDropdown = document.getElementById('community-dropdown');
        if (communityDropdown) communityDropdown.classList.remove('active');
    });
}

// --- Mobile Menu Dropdown Logic ---
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileDropdown = document.getElementById('mobile-dropdown');

if (mobileMenuBtn && mobileDropdown) {
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileDropdown.classList.toggle('active');
        if (contactDropdown) contactDropdown.classList.remove('active');
        // Close community dropdown if it's open
        const communityDropdown = document.getElementById('community-dropdown');
        if (communityDropdown) communityDropdown.classList.remove('active');
    });
}

// --- Community Dropdown Logic ---
const communityBtn = document.getElementById('community-btn');
const communityDropdown = document.getElementById('community-dropdown');

if (communityBtn && communityDropdown) {
    communityBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent window click
        communityDropdown.classList.toggle('active');
        // Close contact dropdown if it's open
        if (contactDropdown) contactDropdown.classList.remove('active');
    });
}

// --- Background Audio Logic ---
const bgAudio = document.getElementById('bg-audio');
const musicToggleBtn = document.getElementById('music-toggle-btn');
const tracks = ['/bg1.mp3', '/bg2.mp3'];
let isMusicPlaying = false;

// Pick a random track to start
let currentTrackIndex = Math.floor(Math.random() * tracks.length);
if (bgAudio) {
    bgAudio.src = tracks[currentTrackIndex];
    bgAudio.volume = 0.1; // Adjust volume as needed
}

const playNextTrack = () => {
    // Pick a random track that isn't the current one (if there are multiple)
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

// Pause audio if the user leaves the tab or minimizes the browser on mobile
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
        e.stopPropagation(); // Prevent document click from firing immediately
        if (isMusicPlaying) {
            bgAudio.pause();
            updateAudioUI(false);
        } else {
            bgAudio.play().catch(e => console.log("Audio play prevented:", e));
            updateAudioUI(true);
        }
    });
}

// Auto-play on first general interaction
const playAudioOnFirstClick = (e) => {
    if (e.target.id === 'music-toggle-btn') return; // Handled by button logic
    if (!isMusicPlaying && bgAudio) {
        bgAudio.play().then(() => {
            updateAudioUI(true);
        }).catch(e => console.log("Audio autoplay prevented"));
    }
    document.removeEventListener('click', playAudioOnFirstClick);
};
document.addEventListener('click', playAudioOnFirstClick);

window.openPostViewer = function (e, postId) {
    // Only open if not clicking delete or edit buttons
    if (e && e.target && (e.target.classList.contains('delete-btn') || e.target.classList.contains('edit-btn'))) return;

    const post = postsDB.find(p => p.id === postId);
    if (!post) return;

    viewerTitle.textContent = post.title;
    viewerBody.textContent = post.content;

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

    // Trello cards use specific badge text coloring natively
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

    if (post.img) {
        let firstImg = post.img;
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

// --- Feed Rendering Engine ---
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

    if (post.img) {
        const imgArray = post.img.split(',');
        if (imgArray.length === 1) {
            // Single Image Logic
            imgHtml = `<img src="${imgArray[0]}" alt="Cover" style="width:100%; height:200px; object-fit:cover; border-radius:8px 8px 0 0;" onerror="this.onerror=null;this.src='${fallbackImg}';">`;
        } else if (imgArray.length > 1) {
            // Multi-Image Carousel Logic
            // The top image sits at z-index 2 and crossfades. The bottom image sits at z-index 1.
            imgHtml = `
            <div class="image-carousel" data-images="${post.img}" data-current="0" style="width:100%; height:200px; border-radius:8px 8px 0 0;">
                <img src="${imgArray[1]}" class="carousel-bottom" alt="Cover" onerror="this.onerror=null;this.src='${fallbackImg}';">
                <img src="${imgArray[0]}" class="carousel-top" alt="Cover" onerror="this.onerror=null;this.src='${fallbackImg}';">
            </div>
            `;
        }
    }

    let paddingStyle = post.img ? 'padding: 20px;' : '';

    // Special style for events to mimic the large card look
    if (post.category === 'events' && post.img) {
        let isExpired = false;
        let timeDisplay = displayDate; // fallback

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
        const btnHtml = isExpired
            ? `<button class="btn-secondary" disabled style="padding: 8px 16px; font-size: 14px; opacity: 0.5; pointer-events: auto; cursor: not-allowed;">Event Over</button>`
            : `<a href="https://discord.gg/EwgsJSPAyy" target="_blank" rel="noopener noreferrer"><button class="btn-primary pulse" style="padding: 8px 16px; font-size: 14px; pointer-events: auto; cursor: pointer;">Join Now</button></a>`;
        const timeSty = isExpired ? "color: #ff4a4a; font-weight: bold;" : "";

        // Construct absolute position background layers so carousels can run underneath event content
        let eventBgHtml = '';
        if (post.img) {
            const imgArray = post.img.split(',').map(s => s.trim());
            if (imgArray.length === 1) {
                eventBgHtml = `
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;">
                    <img src="${imgArray[0]}" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src='${fallbackImg}';this.alt='';">
                </div>
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8));"></div>
                `;
            } else if (imgArray.length > 1) {
                eventBgHtml = `
                <div class="image-carousel" data-images="${post.img}" data-current="0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; border-radius: 0;">
                    <img src="${imgArray[1]}" class="carousel-bottom" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src='${fallbackImg}';this.alt='';">
                    <img src="${imgArray[0]}" class="carousel-top" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null;this.src='${fallbackImg}';this.alt='';">
                </div>
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.4), rgba(10, 5, 5, 0.8)); pointer-events: none;"></div>
                `;
            }
        } else {
            eventBgHtml = `
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: linear-gradient(rgba(10, 5, 5, 0.9), rgba(10, 5, 5, 0.9)); pointer-events: none;"></div>
             `;
        }

        return `
      <div id="post-${post.id}" class="featured-card card event-card post-item" ${post.end_time ? `data-endtime="${post.end_time}"` : ""} style="position: relative; overflow: hidden; padding: 32px; cursor: pointer; border: none; background: #0A0B10;" onclick="openPostViewer(event, '${post.id}')">
        ${eventBgHtml}
        <button class="delete-btn" onclick="deletePost('${post.id}')" style="z-index: 10;">Delete Post</button>
        <button class="edit-btn btn-secondary" onclick="editPost('${post.id}')" style="z-index: 10;">Edit Post</button>
        <div class="card-content" style="position: relative; z-index: 5; pointer-events: none;">
          <span class="badge ${post.badgeClass}" style="${badgeSty}">${badgeTxt}</span>
          <h3 class="card-title" style="margin-top:16px">${post.title}</h3>
          <p class="card-excerpt" style="margin-top:8px">${post.content}</p>
          <div class="event-meta" style="margin-top:24px">
            <span class="mono" style="${timeSty}">${timeDisplay}</span >
            ${btnHtml}
          </div>
        </div>
      </div>
    `;
    }

    return `
    <div id="post-${post.id}" class="news-item card post-item" style="padding:0; overflow:hidden; cursor: pointer;" onclick="openPostViewer(event, '${post.id}')">
      <button class="delete-btn" onclick="deletePost('${post.id}')" style="z-index: 10;">Delete Post</button>
      <button class="edit-btn btn-secondary" onclick="editPost('${post.id}')">Edit Post</button>
      ${imgHtml}
      <div style="padding: 20px; pointer-events: none;">
        <div class="news-header">
          <span class="badge ${post.badgeClass}">${post.badge}</span>
          <span class="news-meta mono">${displayDate}</span>
        </div>
        <h4 class="news-title">${post.title}</h4>
        <p class="text-secondary" style="margin-top: 8px; white-space: pre-wrap;">${post.content}</p>
        <button class="btn-secondary" style="margin-top: 16px; padding: 6px 12px; font-size: 12px; pointer-events: auto;">Read More</button>
      </div>
    </div>
  `;
}

function renderFeeds() {
    const containers = {
        'events': document.getElementById('events-feed-container'),
        'patch-notes': document.getElementById('patch-notes-feed-container'),
        'announcements': document.getElementById('announcements-feed-container')
    };

    // 1. Clear existing standard feeds
    Object.values(containers).forEach(container => {
        if (container) {
            const header = container.querySelector('.section-header');
            container.innerHTML = '';
            if (header) container.appendChild(header);
        }
    });

    // 2. Clear Information Board container
    const infoContainer = document.getElementById('information-board-container');
    if (infoContainer) infoContainer.innerHTML = '';

    // Group Information posts by their defined "boardColumn" or default to "General"
    const boardGroups = {};

    // 3. Render all posts (newest first, using createdAt as reliable fallback)
    [...postsDB].sort((a, b) => {
        const dateA = new Date(a.createdAt || a.date).getTime();
        const dateB = new Date(b.createdAt || b.date).getTime();
        const timeA = isNaN(dateA) ? 0 : dateA;
        const timeB = isNaN(dateB) ? 0 : dateB;
        return timeB - timeA;
    }).forEach(post => {
        // Standard feeds
        if (post.category !== 'information') {
            const container = containers[post.category];
            if (container) {
                container.insertAdjacentHTML('beforeend', createPostHtml(post));
            }
        }
        // Information Board (Trello Style rendering)
        else {
            const column = post.boardColumn || "General";
            if (!boardGroups[column]) boardGroups[column] = [];
            boardGroups[column].push(post);
        }
    });

    // 4. Render Board Columns
    if (infoContainer) {
        // Defined column colors mapping roughly to the reference UI
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

        Object.keys(boardGroups).forEach(colName => {
            const lookup = Object.keys(colColors).find(k => k.toLowerCase() === (colName || "").toLowerCase());
            const colorAccent = lookup ? colColors[lookup] : "#ffffff";
            let cardsHtml = boardGroups[colName].map(post => {
                let imgHtml = '';
                if (post.img) {
                    const imgArray = post.img.split(',');
                    if (imgArray.length === 1) {
                        imgHtml = `<img src="${imgArray[0]}" class="trello-card-cover" alt="Cover" onerror="this.onerror=null;this.src='https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable';">`;
                    } else if (imgArray.length > 1) {
                        imgHtml = `
                        <div class="image-carousel trello-card-cover" data-images="${post.img}" data-current="0" style="position:relative; width:100%; height:200px;">
                            <img src="${imgArray[1]}" class="carousel-bottom" style="height:100%; width:100%; object-fit: cover;" alt="Cover" onerror="this.onerror=null;this.src='https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable';">
                            <img src="${imgArray[0]}" class="carousel-top" style="height:100%; width:100%; object-fit: cover;" alt="Cover" onerror="this.onerror=null;this.src='https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable';">
                        </div>
                        `;
                    }
                }
                return `
                  <div class="trello-card post-item" id="post-${post.id}" onclick="openPostViewer(event, '${post.id}')">
                    <button class="delete-btn" style="position:absolute; top:4px; right:4px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="deletePost('${post.id}')">Delete</button>
                    <button class="edit-btn btn-secondary" style="position:absolute; top:4px; right:52px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="editPost('${post.id}')">Edit</button>
                    ${imgHtml}
                    <div style="pointer-events: none; flex: 1; display: flex; flex-direction: column;">
                        <div class="trello-card-badge" style="color:${colorAccent}">${post.badge}</div>
                        <div class="trello-card-title">${post.title}</div>
                        <div class="trello-card-excerpt">${post.content}</div>
                    </div>
                  </div>
                `;
            }).join('');

            const columnHtml = `
              <div class="board-column">
                <div class="board-column-header" style="border-top: 3px solid ${colorAccent}">${colName}</div>
                ${cardsHtml}
              </div>
            `;
            infoContainer.insertAdjacentHTML('beforeend', columnHtml);
        });

        // 5. Render Category Navbar for the Information Board
        const catContainer = document.getElementById('info-categories');
        if (catContainer) {
            catContainer.innerHTML = '';

            // Generate distinct column names array
            const cols = ['All', ...Object.keys(boardGroups)];

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

    // Refresh the countdown cache after rendering
    if (typeof updateTickingCardsCache === 'function') {
        updateTickingCardsCache();
    }
}

// --- Dev Portal Authentication ---

const authModal = document.getElementById('auth-modal');
const openDevAuthBtn = document.getElementById('open-dev-auth');
const cancelAuthBtn = document.getElementById('auth-cancel');
const submitAuthBtn = document.getElementById('auth-submit');
const emailInput = document.getElementById('dev-email');
const passwordInput = document.getElementById('dev-password');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-dev-btn');

// --- Auto Logout Logic ---
let inactivityTimer;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes auto-logout

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

// Reset timer on user interaction
window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);
window.addEventListener('scroll', resetInactivityTimer);

// Always require fresh login on dev portal load
async function checkSession() {
    try {
        // Destroy any existing session so dev always requires fresh credentials
        await account.deleteSession('current');
    } catch (e) {
        // No session to delete, that's fine
    }

    // Force auth modal
    document.body.classList.remove('dev-mode');
    authModal.classList.add('active');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (authError) authError.style.display = 'none';

    // Hide CMS elements to prevent peeking
    const devPortal = document.getElementById('view-dev-portal');
    if (devPortal) devPortal.style.display = 'none';
}
checkSession();

// The user must authenticate; no "Cancel" or "Open btn" allowed in dev portal
if (cancelAuthBtn) {
    cancelAuthBtn.addEventListener('click', () => {
        // If they cancel, redirect back to home page
        window.location.href = '/index.html';
    });
}

async function authenticate() {
    submitAuthBtn.textContent = 'Logging in...';
    submitAuthBtn.disabled = true;
    authError.style.display = 'none';

    try {
        // Appwrite Login
        await account.createEmailPasswordSession(
            emailInput.value,
            passwordInput.value
        );

        authModal.classList.remove('active');
        document.body.classList.add('dev-mode');
        resetInactivityTimer();
        switchView('view-dev-portal');

    } catch (error) {
        console.error("Login failed:", error);
        authError.textContent = error.message || "Invalid credentials.";
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


// --- CMS Publishing Logic ---
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

// Handle local image file uploads
let selectedImageFiles = [];

if (inputImgFile) {
    inputImgFile.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            selectedImageFiles = Array.from(this.files);
            inputImg.value = `Selected: ${selectedImageFiles.length} file(s)`;

            // Optional: local preview logic could go here if needed for multiple images
        } else {
            selectedImageFiles = [];
        }
    });
}


// Toggle time/board inputs based on category
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

        // Determine badge text/color based on category & input
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
        }

        // Determine Appwrite schema payload based on selected category
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
                // Preserve original creation time if it exists
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
                version_number: title, // You might want a dedicated field for this later, using Title for now
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
                let finalImageUrl = img; // default to whatever URL or text was typed manually

                // If a real file was selected via the "Upload File" button
                if (selectedImageFiles && selectedImageFiles.length > 0) {
                    publishBtn.textContent = `Uploading ${selectedImageFiles.length} Image(s)...`;

                    // Upload all files concurrently
                    const uploadPromises = selectedImageFiles.map(async (file) => {
                        const uploadedFile = await storage.createFile(
                            APPWRITE_CONFIG.bucketId,
                            ID.unique(),
                            file
                        );
                        return storage.getFileView(APPWRITE_CONFIG.bucketId, uploadedFile.$id);
                    });

                    const newUrls = await Promise.all(uploadPromises);

                    // Maintain existing manually typed comma URLs if they exist and append the new ones,
                    // otherwise just use the new ones.
                    if (img && !img.startsWith('Selected: ')) {
                        finalImageUrl = img + ',' + newUrls.join(',');
                    } else {
                        finalImageUrl = newUrls.join(',');
                    }

                    payload.image = finalImageUrl;
                } else if (img && img.startsWith('Selected: ')) {
                    // Failsafe in case a "Selected" string got caught without a file mapping
                    finalImageUrl = "";
                    payload.image = "";
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

                // modify existing or create new post
                if (editingPostId) {
                    const postIndex = postsDB.findIndex(p => p.id === editingPostId);
                    const oldCategory = postIndex !== -1 ? postsDB[postIndex].category : category;

                    if (oldCategory !== category) {
                        // Moving between collections
                        await databases.deleteDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[oldCategory], editingPostId);
                        const newDoc = await databases.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], ID.unique(), payload);
                        if (postIndex !== -1) postsDB[postIndex] = { ...localPostData, id: newDoc.$id };
                    } else {
                        await databases.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], editingPostId, payload);
                        if (postIndex !== -1) postsDB[postIndex] = { ...postsDB[postIndex], ...localPostData };
                    }

                    editingPostId = null;
                } else {
                    const newDoc = await databases.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections[category], ID.unique(), payload);
                    const newPost = { ...localPostData, id: newDoc.$id };
                    postsDB.push(newPost);
                }

                // Reset file selector state
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

// --- CMS Toolbar Buttons ---
document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tag = e.target.getAttribute('data-tag');
        if (!tag) return;

        // Simple mock insertion at the end for demonstration 
        // (A real implementation would wrap selected text)
        if (inputBody) {
            inputBody.value += ` ${tag} `;
            inputBody.focus();
        }
    });
});

// --- Live Ticking Countdowns ---
// Cache the event cards that specifically have an end time so we don't query the whole document every second
let tickingEventCards = [];
function updateTickingCardsCache() {
    tickingEventCards = Array.from(document.querySelectorAll('.event-card[data-endtime]'));
}

// Call this once initially and whenever feeds are re-rendered
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
            // It just expired live! Let's update the card to look ended
            card.removeAttribute('data-endtime'); // Stop ticking

            // Remove from cached array since it's done ticking
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
            // Update ticking countdown
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
                timeSpan.textContent = timeDisplay; // Only update DOM if text actually changed
            }
        }
    });
}, 1000);

// --- Live Image Carousel Auto-Rotation ---
let carouselElements = [];
function updateCarouselCache() {
    carouselElements = Array.from(document.querySelectorAll('.image-carousel'));
}
// Hook this cache refresh at the end of renderFeeds as well
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
        if (images.length <= 1) return; // No need to rotate a single image

        let currentIndex = parseInt(carousel.getAttribute('data-current') || '0', 10);
        const topImg = carousel.querySelector('.carousel-top');
        const bottomImg = carousel.querySelector('.carousel-bottom');

        if (!topImg || !bottomImg) return;

        // Calculate the next index
        const nextIndex = (currentIndex + 1) % images.length;

        // 1. Prepare bottom image to be the NEXT image
        bottomImg.src = images[nextIndex];

        // 2. Trigger CSS Crossfade (Fade out the current top image to reveal the bottom one)
        topImg.style.opacity = '0';

        // 3. After the CSS transition finishes (500ms based on style.css), reset state
        setTimeout(() => {
            // Snap the top image to the new image while invisible
            topImg.src = images[nextIndex];

            // Instantly restore opacity (requires briefly disabling transition to avoid reverse fade)
            topImg.style.transition = 'none';
            topImg.style.opacity = '1';

            // Re-enable transition for the NEXT cycle
            // Use requestAnimationFrame for smoother paint cycle resumption
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    topImg.style.transition = 'opacity 0.5s ease-in-out';
                });
            });

            // Update tracking index
            carousel.setAttribute('data-current', nextIndex);
        }, 500); // Must match transition duration in CSS
    });
}, 4000); // Rotate every 4 seconds

// --- Background Slideshow Rotation ---
const bgSlides = ['/image.png', '/Copy_of_goat.png', '/gat_1.png'];
let bgCurrentIndex = 0;

// Keep slideshow height fixed (handled via CSS `position: fixed` now)

setInterval(() => {
    const topSlide = document.getElementById('bg-slide-top');
    const bottomSlide = document.getElementById('bg-slide-bottom');
    if (!topSlide || !bottomSlide) return;

    const nextIndex = (bgCurrentIndex + 1) % bgSlides.length;

    // Prepare the bottom layer with the next image
    bottomSlide.style.backgroundImage = `url('${bgSlides[nextIndex]}')`;
    bottomSlide.style.opacity = '0.3';

    // Fade out the top layer to reveal the bottom
    topSlide.style.opacity = '0';

    // After transition completes, swap top to the new image and restore
    setTimeout(() => {
        topSlide.style.transition = 'none';
        topSlide.style.backgroundImage = `url('${bgSlides[nextIndex]}')`;
        topSlide.style.opacity = '0.3';

        setTimeout(() => {
            topSlide.style.transition = 'opacity 1.5s ease-in-out';
        }, 50);

        bgCurrentIndex = nextIndex;
    }, 1500); // Must match CSS transition duration
}, 8000); // Rotate every 8 seconds
