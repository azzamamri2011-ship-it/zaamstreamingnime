/* ===========================
   ZAAMSTREAM V2 — script.js
   =========================== */

const API_BASE = "https://www.sankavollerei.com";
let scheduleData = [];
let searchTimeout = null;

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    loadHomeData();
});

// ===========================
// NAVIGATION
// ===========================
function switchPage(pageId, element) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Activate target page
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');

    // Activate nav item
    if (element) {
        element.classList.add('active');
    } else {
        // Find matching nav item by onclick attribute
        document.querySelectorAll('.nav-item').forEach(n => {
            const onclick = n.getAttribute('onclick') || '';
            if (onclick.includes(`'${pageId}'`)) n.classList.add('active');
        });
    }

    // Scroll to top
    window.scrollTo({ top: 0 });

    // Lazy-load page data
    if (pageId === 'home') loadHomeData();
    if (pageId === 'schedule') loadSchedule();
}

// ===========================
// LOADER HELPER
// ===========================
function showLoader(id, message = 'Memuat data...') {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = `
            <div class="loader">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${message}</p>
            </div>`;
    }
}

function showError(id, message = 'Gagal memuat data. Coba lagi.') {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>${message}</p>
            </div>`;
    }
}

// ===========================
// HOME PAGE
// ===========================
async function loadHomeData() {
    const ongoingEl = document.getElementById('ongoing-list');
    const completedEl = document.getElementById('completed-grid');
    if (!ongoingEl || !completedEl) return;

    // Only reload if empty
    if (ongoingEl.innerHTML.includes('card-h')) return;

    showLoader('ongoing-list', 'Memuat anime...');

    try {
        const res = await fetch(`${API_BASE}/anime/home`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        const data = json.data;

        // Ongoing / Airing
        ongoingEl.innerHTML = data.ongoing.animeList.map(anime => `
            <div class="card-h" onclick="openDetail('${escapeAttr(anime.href)}')">
                <span class="ep-tag">${escapeHtml(anime.releaseDay)}</span>
                <img src="${escapeAttr(anime.poster)}" loading="lazy" alt="${escapeAttr(anime.title)}">
                <div class="card-title">${escapeHtml(anime.title)}</div>
            </div>
        `).join('');

        // Completed
        completedEl.innerHTML = data.completed.animeList.map(anime => `
            <div class="card-v" onclick="openDetail('${escapeAttr(anime.href)}')">
                <img src="${escapeAttr(anime.poster)}" loading="lazy" alt="${escapeAttr(anime.title)}">
                <div class="info">
                    <h4>${escapeHtml(anime.title)}</h4>
                    <div class="meta">
                        <i class="fa-solid fa-star" style="color:#facc15;font-size:0.65rem"></i>
                        ${escapeHtml(String(anime.score || 'N/A'))}
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Home load error:', e);
        showError('ongoing-list', 'Gagal memuat. Periksa koneksi internet.');
        showError('completed-grid', '');
    }
}

// ===========================
// SCHEDULE PAGE
// ===========================
async function loadSchedule() {
    if (scheduleData.length > 0) return; // Cache — don't refetch

    const daySelector = document.getElementById('day-selector');
    const scheduleGrid = document.getElementById('schedule-grid');
    if (!daySelector || !scheduleGrid) return;

    showLoader('schedule-grid', 'Memuat jadwal rilis...');

    try {
        const res = await fetch(`${API_BASE}/anime/schedule`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        scheduleData = json.data;

        // Render day buttons
        daySelector.innerHTML = scheduleData.map((item, index) => `
            <button class="day-btn ${index === 0 ? 'active' : ''}"
                    onclick="filterSchedule('${escapeAttr(item.day)}', this)">
                ${escapeHtml(item.day)}
            </button>
        `).join('');

        // Show first day
        if (scheduleData[0]) renderDayList(scheduleData[0].anime_list);

    } catch (e) {
        console.error('Schedule load error:', e);
        showError('schedule-grid', 'Gagal memuat jadwal.');
    }
}

function filterSchedule(dayName, el) {
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    const day = scheduleData.find(d => d.day === dayName);
    if (day) renderDayList(day.anime_list);
}

function renderDayList(list) {
    const grid = document.getElementById('schedule-grid');
    if (!list || list.length === 0) {
        grid.innerHTML = '<div class="error-state"><p>Tidak ada anime hari ini.</p></div>';
        return;
    }
    grid.innerHTML = list.map(anime => `
        <div class="card-v" onclick="openDetail('${escapeAttr(anime.url || anime.href || '')}')">
            <img src="${escapeAttr(anime.poster)}" loading="lazy" alt="${escapeAttr(anime.title)}">
            <div class="info">
                <h4>${escapeHtml(anime.title)}</h4>
                <div class="meta">${escapeHtml(anime.slug || '')}</div>
            </div>
        </div>
    `).join('');
}

// ===========================
// SEARCH
// ===========================
function handleSearch(event) {
    const query = event.target.value.trim();
    const clearBtn = document.getElementById('searchClear');
    const infoEl = document.getElementById('search-result-info');
    const emptyEl = document.getElementById('search-empty');
    const grid = document.getElementById('search-grid');

    // Show/hide clear button
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

    if (query.length === 0) {
        infoEl.style.display = 'none';
        emptyEl.style.display = 'block';
        grid.innerHTML = '';
        return;
    }

    if (query.length < 3) return;

    emptyEl.style.display = 'none';

    // Debounce
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(query), 350);
}

async function doSearch(query) {
    const infoEl = document.getElementById('search-result-info');
    const queryTextEl = document.getElementById('search-query-text');
    const countEl = document.getElementById('search-count');
    const grid = document.getElementById('search-grid');

    infoEl.style.display = 'flex';
    if (queryTextEl) queryTextEl.textContent = `Hasil: "${query}"`;

    showLoader('search-grid', 'Mencari...');

    try {
        const res = await fetch(`${API_BASE}/anime/search/${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        const list = json.data.animeList || [];

        if (countEl) countEl.textContent = `${list.length} hasil`;

        if (list.length === 0) {
            grid.innerHTML = `
                <div class="error-state" style="grid-column:1/-1">
                    <i class="fa-solid fa-face-frown"></i>
                    <p>Anime "${query}" tidak ditemukan.</p>
                </div>`;
            return;
        }

        grid.innerHTML = list.map(anime => `
            <div class="card-v" onclick="openDetail('${escapeAttr(anime.href)}')">
                <img src="${escapeAttr(anime.poster)}" loading="lazy" alt="${escapeAttr(anime.title)}">
                <div class="info">
                    <h4>${escapeHtml(anime.title)}</h4>
                    <div class="meta">${escapeHtml(anime.status || '')}</div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Search error:', e);
        showError('search-grid', 'Gagal melakukan pencarian.');
    }
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    const infoEl = document.getElementById('search-result-info');
    const emptyEl = document.getElementById('search-empty');
    const grid = document.getElementById('search-grid');

    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (grid) grid.innerHTML = '';
}

// ===========================
// DETAIL PAGE
// ===========================
async function openDetail(href) {
    if (!href) return;

    const overlay = document.getElementById('detail-page');
    const content = document.getElementById('detail-content');

    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Scroll overlay to top
    overlay.scrollTo({ top: 0 });

    content.innerHTML = `
        <div style="padding-top:14px;padding-left:14px">
            <div class="detail-back-btn" onclick="closeDetail()">
                <i class="fa-solid fa-arrow-left"></i>
            </div>
        </div>
        <div class="loader" style="padding-top:30vh">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Memuat detail anime...</p>
        </div>`;

    try {
        const res = await fetch(`${API_BASE}${href}`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        const anime = json.data;

        const genreHTML = (anime.genreList || [])
            .map(g => `<span class="genre-tag">${escapeHtml(g.title)}</span>`)
            .join('');

        const epCount = (anime.episodeList || []).length;

        const epHTML = (anime.episodeList || []).map(ep => `
            <div class="ep-item" onclick="openPlayer('${escapeAttr(ep.href)}')">
                <div class="ep-left">
                    <div class="ep-number">${escapeHtml(String(ep.eps))}</div>
                    <div class="ep-info">
                        <span class="ep-name">Episode ${escapeHtml(String(ep.eps))}</span>
                        <span class="ep-date">${escapeHtml(ep.date || '')}</span>
                    </div>
                </div>
                <div class="ep-play-btn">
                    <i class="fa-solid fa-play"></i>
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <!-- Hero Banner -->
            <div class="detail-hero">
                <div class="detail-back-btn" onclick="closeDetail()">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <img src="${escapeAttr(anime.poster)}" alt="${escapeAttr(anime.title)}">
                <div class="detail-hero-overlay"></div>
            </div>

            <!-- Body -->
            <div class="detail-body">
                <h1 class="detail-title">${escapeHtml(anime.title)}</h1>

                <!-- Genres -->
                <div class="genre-list">
                    ${genreHTML}
                </div>

                <!-- Episode List Header -->
                <div class="ep-section-header">
                    <span class="ep-title">Episode List</span>
                    <span class="ep-count">${epCount} Eps</span>
                </div>

                <!-- Episodes -->
                <div class="ep-list">
                    ${epHTML || '<p style="color:var(--text-dim);font-size:0.85rem">Belum ada episode.</p>'}
                </div>
            </div>
        `;

    } catch (e) {
        console.error('Detail load error:', e);
        content.innerHTML = `
            <div style="padding:14px">
                <div class="detail-back-btn" onclick="closeDetail()" style="position:relative;top:0;left:0;margin-bottom:20px">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
            </div>
            <div class="error-state">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>Gagal memuat detail anime. Coba lagi.</p>
            </div>`;
    }
}

function closeDetail() {
    document.getElementById('detail-page').style.display = 'none';
    document.body.style.overflow = '';
}

// ===========================
// PLAYER PAGE
// ===========================
async function openPlayer(epHref) {
    if (!epHref) return;

    const playerPage = document.getElementById('player-page');
    const content = document.getElementById('player-content');

    playerPage.style.display = 'block';
    playerPage.scrollTo({ top: 0 });

    content.innerHTML = `
        <div class="player-nav-bar" onclick="closePlayer()">
            <div class="player-nav-back"><i class="fa-solid fa-arrow-left"></i></div>
            <span class="player-nav-text">Kembali</span>
        </div>
        <div class="loader" style="padding-top:25vh">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Memuat video...</p>
        </div>`;

    try {
        const res = await fetch(`${API_BASE}${epHref}`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        const stream = json.data;

        content.innerHTML = `
            <!-- Top Nav Bar -->
            <div class="player-nav-bar" onclick="closePlayer()">
                <div class="player-nav-back">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <span class="player-nav-text">Kembali ke Detail</span>
            </div>

            <!-- Video Player — Full Width 16:9 -->
            <div class="video-container">
                <iframe
                    src="${escapeAttr(stream.defaultStreamingUrl)}"
                    allowfullscreen
                    allow="autoplay; fullscreen; picture-in-picture"
                    scrolling="no"
                ></iframe>
            </div>

            <!-- Info Below Player -->
            <div class="player-info-box">
                <h2 class="player-title">${escapeHtml(stream.title)}</h2>
                <div class="player-meta-row">
                    <span class="player-badge badge-red">
                        <i class="fa-solid fa-play" style="font-size:0.6rem"></i>
                        Now Playing
                    </span>
                    <span class="player-badge badge-dark">
                        <i class="fa-solid fa-globe" style="font-size:0.6rem"></i>
                        Sub Indo
                    </span>
                </div>
            </div>
        `;

    } catch (e) {
        console.error('Player load error:', e);
        content.innerHTML = `
            <div class="player-nav-bar" onclick="closePlayer()">
                <div class="player-nav-back"><i class="fa-solid fa-arrow-left"></i></div>
                <span class="player-nav-text">Kembali</span>
            </div>
            <div class="error-state">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>Gagal memuat video. Coba lagi.</p>
            </div>`;
    }
}

function closePlayer() {
    document.getElementById('player-page').style.display = 'none';
}

// ===========================
// UTILITIES
// ===========================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}