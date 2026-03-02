import './style.css';

// --- Global Data Store (Persistent DB) ---
// We will store posts in localStorage so they persist across reloads.
const STORAGE_KEY = 'bleach_posts_v1';

// Default mock data to populate if localStorage is empty
const defaultPosts = [
    {
        id: 1,
        title: "Captain-Commander's Address",
        category: "news",
        content: "All captains are to report to the First Division barracks immediately for an urgent meeting regarding recent Hollow activity in Karakura Town.",
        img: "",
        date: "Nov 14",
        badge: "GOTEI 13 ANNOUNCEMENT",
        badgeClass: "news"
    },
    {
        id: 2,
        title: "Hueco Mundo Expedition",
        category: "events",
        content: "A special task force is being assembled to investigate Las Noches. High spiritual pressure combatants required.",
        img: "https://images.unsplash.com/photo-1542451313056-b7c8e626645f?auto=format&fit=crop&q=80&w=1000",
        date: "Deploying in 2d 14h",
        badge: "URGENT MISSION",
        badgeClass: "event"
    },
    {
        id: 3,
        title: "Senkaimon Synchronization Update",
        category: "patch-notes",
        content: "Fixed spiritual particle lag when opening gates to the World of the Living. \n Increased Hell Butterfly tracking accuracy.",
        img: "",
        date: "Today",
        badge: "KIDO CORPS UPDATE",
        badgeClass: "dev"
    },
    {
        id: 4,
        title: "Origins of the Hogyoku",
        category: "wiki",
        content: "Classified report by Kisuke Urahara: A substance capable of dissolving the boundaries between Soul Reaper and Hollow.",
        img: "",
        date: "Classified",
        badge: "DATACUBE RECORD",
        badgeClass: "lore"
    }
];

// Initialize postsDB from localStorage, or fallback to defaults
let postsDB = [];
try {
    const savedPosts = localStorage.getItem(STORAGE_KEY);
    if (savedPosts) {
        postsDB = JSON.parse(savedPosts);
    } else {
        postsDB = [...defaultPosts];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(postsDB));
    }
} catch (e) {
    console.error("Error loading from localStorage, falling back to defaults", e);
    postsDB = [...defaultPosts];
}

// Helper to save DB to localStorage
function saveToDB() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(postsDB));
}

// --- Navigation Logic ---
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.view-section');

// Attach delete to window so inline onclick can see it
window.deletePost = function (id) {
    if (confirm("Are you sure you want to delete this post?")) {
        // Find the element to animate it out
        const postElement = document.getElementById(`post-${id}`);
        if (postElement) {
            postElement.style.animation = "fadeOut 0.3s ease forwards";
        }

        setTimeout(() => {
            postsDB = postsDB.filter(post => post.id !== id);
            // Save changes to localStorage
            saveToDB();
            renderFeeds();

            const toastNode = document.getElementById('toast');
            if (toastNode) {
                toastNode.textContent = "Post Deleted!";
                toastNode.classList.add('delete-toast');
                toastNode.classList.add('show');
                setTimeout(() => {
                    toastNode.classList.remove('show');
                    toastNode.classList.remove('delete-toast');
                    // revert text for next publish
                    setTimeout(() => toastNode.textContent = "Post Published!", 300);
                }, 3000);
            }
        }, 300); // Wait for animation
    }
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

// Add simple Wiki Filter logic
window.filterWiki = function (query) {
    const wikiContainer = document.getElementById('wiki-feed-container');
    if (!wikiContainer) return;

    const posts = wikiContainer.querySelectorAll('.news-item');
    posts.forEach(post => {
        if (query === 'All') {
            post.style.display = 'flex';
        } else {
            const text = post.innerText.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                post.style.display = 'flex';
            } else {
                post.style.display = 'none';
            }
        }
    });
}

navLinks.forEach(link => {
    link.addEventListener('click', () => switchView(link.getAttribute('data-target')));
});

const devPortal = document.getElementById('view-dev-portal');
if (devPortal) devPortal.style.display = 'none';

// --- Feed Rendering Engine ---
function createPostHtml(post) {
    let imgHtml = post.img ? `<img src="${post.img}" alt="Cover" style="width:100%; height:200px; object-fit:cover; border-radius:8px 8px 0 0;">` : '';
    let paddingStyle = post.img ? 'padding: 20px;' : '';

    // Special style for events to mimic the large card look
    if (post.category === 'events' && post.img) {
        return `
      <div id="post-${post.id}" class="featured-card card event-card post-item" style="background: linear-gradient(rgba(10, 5, 5, 0.9), rgba(10, 5, 5, 0.9)), url('${post.img}') center/cover; padding: 32px">
        <button class="delete-btn" onclick="deletePost(${post.id})">Delete Post</button>
        <div class="card-content">
          <span class="badge ${post.badgeClass}">${post.badge}</span>
          <h3 class="card-title" style="margin-top:16px">${post.title}</h3>
          <p class="card-excerpt" style="margin-top:8px">${post.content}</p>
          <div class="event-meta" style="margin-top:24px">
            <span class="mono">${post.date}</span >
            <button class="btn-primary pulse" style="padding: 8px 16px; font-size: 14px;">Join Now</button>
          </div>
        </div>
      </div>
    `;
    }

    return `
    <div id="post-${post.id}" class="news-item card post-item" style="padding:0; overflow:hidden;">
      <button class="delete-btn" onclick="deletePost(${post.id})">Delete Post</button>
      ${imgHtml}
      <div style="padding: 20px;">
        <div class="news-header">
          <span class="badge ${post.badgeClass}">${post.badge}</span>
          <span class="news-meta mono">${post.date}</span>
        </div>
        <h4 class="news-title">${post.title}</h4>
        <p class="text-secondary" style="margin-top: 8px; white-space: pre-wrap;">${post.content}</p>
        <button class="btn-secondary" style="margin-top: 16px; padding: 6px 12px; font-size: 12px" onclick="alert('Viewing full details!')">Read More</button>
      </div>
    </div>
  `;
}

function renderFeeds() {
    const containers = {
        'news': document.getElementById('news-feed-container'),
        'events': document.getElementById('events-feed-container'),
        'patch-notes': document.getElementById('patch-notes-feed-container'),
        'wiki': document.getElementById('wiki-feed-container')
    };

    // Clear existing (but keep header)
    Object.values(containers).forEach(container => {
        if (container) {
            const header = container.querySelector('.section-header');
            container.innerHTML = '';
            if (header) container.appendChild(header);
        }
    });

    // Inject posts based on category
    // Using reverse to show newest first
    [...postsDB].reverse().forEach(post => {
        const container = containers[post.category];
        if (container) {
            container.insertAdjacentHTML('beforeend', createPostHtml(post));
        }
    });
}

// Initial Render
renderFeeds();


// --- Dev Portal Authentication ---
const authModal = document.getElementById('auth-modal');
const openDevAuthBtn = document.getElementById('open-dev-auth');
const cancelAuthBtn = document.getElementById('auth-cancel');
const submitAuthBtn = document.getElementById('auth-submit');
const passwordInput = document.getElementById('dev-password');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-dev-btn');

const DEV_PASSWORD = "k9!vP2#mR7$L";

if (openDevAuthBtn) {
    openDevAuthBtn.addEventListener('click', () => {
        authModal.classList.add('active');
        passwordInput.value = '';
        authError.style.display = 'none';
        passwordInput.focus();
    });
}
if (cancelAuthBtn) {
    cancelAuthBtn.addEventListener('click', () => authModal.classList.remove('active'));
}

function authenticate() {
    if (passwordInput.value === DEV_PASSWORD) {
        authModal.classList.remove('active');

        // --- ADDED THIS LINE ---
        document.body.classList.add('dev-mode');
        // -----------------------

        switchView('view-dev-portal');
        openDevAuthBtn.textContent = 'Dev Logged In';
        openDevAuthBtn.style.background = 'rgba(0, 212, 255, 0.2)';
        openDevAuthBtn.style.color = '#00D4FF';
    } else {
        authError.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

if (submitAuthBtn) submitAuthBtn.addEventListener('click', authenticate);
if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') authenticate();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // --- ADDED THIS LINE ---
        document.body.classList.remove('dev-mode');
        // -----------------------

        switchView('view-news');
        openDevAuthBtn.textContent = 'Developer Access';
        openDevAuthBtn.style.background = 'transparent';
        openDevAuthBtn.style.color = 'var(--primary-accent)';
    });
}


// --- CMS Publishing Logic ---
const publishBtn = document.getElementById('publish-btn');
const inputTitle = document.getElementById('cms-title');
const inputCategory = document.getElementById('cms-category');
const inputTime = document.getElementById('cms-time');
const inputTimeGroup = document.getElementById('cms-time-group');
const inputImg = document.getElementById('cms-img');
const inputBody = document.getElementById('cms-body');
const toastNode = document.getElementById('toast');

// Toggle time input based on category
if (inputCategory) {
    inputCategory.addEventListener('change', (e) => {
        if (e.target.value === 'events') {
            inputTimeGroup.style.display = 'block';
        } else {
            inputTimeGroup.style.display = 'none';
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

        // Determine badge text based on category
        let badgeTxt = "UPDATE";
        let badgeCls = "dev";
        let finalDate = "Just Now";

        if (category === "news") { badgeTxt = "NEWS"; badgeCls = "news"; }
        if (category === "events") {
            badgeTxt = "EVENT";
            badgeCls = "event";
            finalDate = inputTime.value.trim() || "Ongoing";
        }
        if (category === "patch-notes") { badgeTxt = "PATCH NOTE"; badgeCls = "dev"; }
        if (category === "wiki") { badgeTxt = "LORE"; badgeCls = "lore"; }

        // create new post
        const newPost = {
            id: Date.now(),
            title: title,
            category: category,
            content: body,
            img: img,
            date: finalDate,
            badge: badgeTxt,
            badgeClass: badgeCls
        };

        postsDB.push(newPost);
        // Save to localStorage
        saveToDB();
        renderFeeds();

        // Clear form
        inputTitle.value = '';
        inputBody.value = '';
        inputImg.value = '';
        if (inputTime) inputTime.value = '';

        // Show Toast
        toastNode.classList.add('show');
        setTimeout(() => {
            toastNode.classList.remove('show');
        }, 3000);
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
