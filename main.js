import { inject } from '@vercel/analytics';
import './style.css';
import { databases, account, storage, APPWRITE_CONFIG, ID } from './src/appwrite.js';

// Initialize Vercel Analytics tracking
inject();

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
                collectionId
            );

            // Map Appwrite documents to our frontend structure
            const docs = response.documents.map(doc => {
                let mappedDoc = {
                    id: doc.$id,
                    category: category,
                    img: doc.image || doc.img || "", // Read image property if it exists
                    badgeClass: "dev" // Default
                };

                if (category === 'announcements') {
                    mappedDoc.title = doc.headline || "Untitled";
                    mappedDoc.content = doc.content || "";
                    mappedDoc.date = doc.timestamp || "Unknown";
                    mappedDoc.badge = "ANNOUNCEMENT";
                } else if (category === 'events') {
                    mappedDoc.title = doc.event_name || "Untitled";
                    mappedDoc.content = doc.description || "";
                    mappedDoc.date = doc.start_time || "Unknown";
                    mappedDoc.badge = "EVENT";
                    mappedDoc.badgeClass = "event";
                } else if (category === 'patch-notes') {
                    mappedDoc.title = doc.version_number || "Untitled";
                    mappedDoc.content = doc.notes || "";
                    mappedDoc.date = doc.date || "Unknown";
                    mappedDoc.badge = "PATCH NOTE";
                } else if (category === 'information') {
                    mappedDoc.title = doc.title || "Untitled";
                    mappedDoc.content = doc.content || "";
                    mappedDoc.boardColumn = doc.category || undefined;
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
const navLinks = document.querySelectorAll('.nav-link');
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
        document.getElementById('cms-time').value = post.date;
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
    navLinks.forEach(l => l.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if (targetLink) targetLink.classList.add('active');

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
window.filterWiki = function (query) {
    const boardCards = document.querySelectorAll('.trello-card');

    boardCards.forEach(card => {
        if (!query || query.trim() === '') {
            card.style.display = 'block';
        } else {
            const titleEl = card.querySelector('.trello-card-title');
            const titleText = titleEl ? titleEl.innerText.toLowerCase() : '';
            if (titleText.includes(query.toLowerCase())) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        }
    });

    // Hide entire columns if all cards inside them are hidden by the search
    const columns = document.querySelectorAll('.board-column');
    columns.forEach(col => {
        const visibleCards = Array.from(col.querySelectorAll('.trello-card'))
            .filter(c => c.style.display !== 'none');
        if (visibleCards.length === 0 && query.trim() !== '') {
            col.style.display = 'none';
        } else {
            col.style.display = 'flex';
        }
    });
}

navLinks.forEach(link => {
    link.addEventListener('click', () => switchView(link.getAttribute('data-target')));
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
    viewerDate.textContent = post.date;
    viewerBadge.textContent = post.badge;
    viewerBadge.className = `badge ${post.badgeClass || 'dev'}`;

    // Trello cards use specific badge text coloring natively
    if (post.category === 'information') {
        const colColors = { "Shinigami": "#E50914", "Hollows": "#8e44ad", "Quincy": "#00D4FF", "General": "#F59E0B" };
        const colorAccent = colColors[post.boardColumn] || colColors["General"];
        viewerBadge.style.background = 'rgba(0,0,0,0.5)';
        viewerBadge.style.color = colorAccent;
    } else {
        viewerBadge.style.background = '';
        viewerBadge.style.color = '';
    }

    if (post.img) {
        viewerImg.src = post.img;
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
    const fallbackImg = "https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable";
    let imgHtml = post.img ? `<img src="${post.img}" alt="Cover" style="width:100%; height:200px; object-fit:cover; border-radius:8px 8px 0 0;" onerror="this.onerror=null;this.src='${fallbackImg}';">` : '';
    let paddingStyle = post.img ? 'padding: 20px;' : '';

    // Special style for events to mimic the large card look
    if (post.category === 'events' && post.img) {
        return `
      <div id="post-${post.id}" class="featured-card card event-card post-item" style="background: linear-gradient(rgba(10, 5, 5, 0.9), rgba(10, 5, 5, 0.9)), url('${post.img}') center/cover; padding: 32px; cursor: pointer;" onclick="openPostViewer(event, '${post.id}')">
        <button class="delete-btn" onclick="deletePost('${post.id}')" style="z-index: 10;">Delete Post</button>
        <button class="edit-btn btn-secondary" onclick="editPost('${post.id}')">Edit Post</button>
        <div class="card-content" style="pointer-events: none;">
          <span class="badge ${post.badgeClass}">${post.badge}</span>
          <h3 class="card-title" style="margin-top:16px">${post.title}</h3>
          <p class="card-excerpt" style="margin-top:8px">${post.content}</p>
          <div class="event-meta" style="margin-top:24px">
            <span class="mono">${post.date}</span >
            <button class="btn-primary pulse" style="padding: 8px 16px; font-size: 14px; pointer-events: auto;">Join Now</button>
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
          <span class="news-meta mono">${post.date}</span>
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

    // 3. Render all posts
    [...postsDB].reverse().forEach(post => {
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
            "Shinigami": "#E50914",   // Vibrant Red
            "Hollows": "#8e44ad",     // Purple/Dark
            "Quincy": "#00D4FF",      // Blue
            "General": "#F59E0B"      // Orange
        };

        Object.keys(boardGroups).forEach(colName => {
            const colorAccent = colColors[colName] || "#ffffff";
            let cardsHtml = boardGroups[colName].map(post => {
                let imgHtml = post.img ? `<img src="${post.img}" class="trello-card-cover" alt="Cover" onerror="this.onerror=null;this.src='https://placehold.co/600x200/1a1a2e/ffffff?text=Image+Unavailable';">` : '';
                return `
                  <div class="trello-card post-item" id="post-${post.id}" onclick="openPostViewer(event, '${post.id}')">
                    <button class="delete-btn" style="position:absolute; top:4px; right:4px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="deletePost('${post.id}')">Delete</button>
                    <button class="edit-btn btn-secondary" style="position:absolute; top:4px; right:52px; z-index: 10; font-size: 10px; padding: 2px 6px;" onclick="editPost('${post.id}')">Edit</button>
                    ${imgHtml}
                    <div style="pointer-events: none;">
                        <div class="trello-card-badge" style="color:${colorAccent}">${post.badge}</div>
                        <div class="trello-card-title">${post.title}</div>
                        <div style="font-size:12px; color:#5e6c84;">${post.content.substring(0, 80)}...</div>
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
            switchView('view-events');
            alert("Session expired due to inactivity.");
        }, INACTIVITY_LIMIT);
    }
}

// Reset timer on user interaction
window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);
window.addEventListener('scroll', resetInactivityTimer);

// Check if user is already logged in on page load
async function checkSession() {
    try {
        await account.get(); // If this succeeds, there is an active session
        document.body.classList.add('dev-mode');
        resetInactivityTimer();
        // Optionally switch them to dev portal immediately if you want
    } catch (error) {
        // Not logged in, do nothing
        document.body.classList.remove('dev-mode');
    }
}
checkSession();

if (openDevAuthBtn) {
    openDevAuthBtn.addEventListener('click', () => {
        authModal.classList.add('active');
        if (emailInput) emailInput.value = '';
        passwordInput.value = '';
        authError.style.display = 'none';
        if (emailInput) emailInput.focus();
    });
}
if (cancelAuthBtn) {
    cancelAuthBtn.addEventListener('click', () => authModal.classList.remove('active'));
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
        switchView('view-events');
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
let selectedImageFile = null;

if (inputImgFile) {
    inputImgFile.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            selectedImageFile = this.files[0];
            inputImg.value = `Selected: ${selectedImageFile.name}`;

            // Generate a local preview for the viewer (optional but requested base behavior)
            const reader = new FileReader();
            reader.onload = function (e) {
                // We keep the actual file for Appwrite, but could use this for a local live preview
            };
            reader.readAsDataURL(selectedImageFile);
        } else {
            selectedImageFile = null;
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
            payload = {
                event_name: title,
                description: body,
                start_time: finalDate !== "Just Now" ? finalDate : new Date().toISOString(),
                end_time: "", // Optional or could be added to UI later
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
                if (selectedImageFile) {
                    // Upload to Appwrite Storage Bucket
                    publishBtn.textContent = "Uploading Image...";
                    const uploadedFile = await storage.createFile(
                        APPWRITE_CONFIG.bucketId,
                        ID.unique(),
                        selectedImageFile
                    );

                    // Manually construct the raw REST API view URL to bypass strict Appwrite Cookie Checks for Incognito users
                    const projectId = '69a594120012d4480ace'; // Your Appwrite Project ID
                    finalImageUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${APPWRITE_CONFIG.bucketId}/files/${uploadedFile.$id}/view?project=${projectId}&mode=admin`;

                    payload.image = finalImageUrl; // Update the Appwrite schema payload
                } else if (img && img.startsWith('Selected: ')) {
                    // Failsafe in case a "Selected" string got caught without a file mapping
                    finalImageUrl = "";
                    payload.image = "";
                }

                const localPostData = {
                    ...payload,
                    category,
                    title: title,
                    date: finalDate !== "Just Now" ? finalDate : new Date().toISOString(),
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
                selectedImageFile = null;
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
