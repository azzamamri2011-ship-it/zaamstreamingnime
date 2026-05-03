/* ===========================
   ZAAMSTREAM V2 — script.js
   =========================== */

const API_BASE = "https://www.sankavollerei.com";
let scheduleData = [];
let searchTimeout = null;

// Current player state (for quality switching)
let currentPlayerState = {
    epHref: null,
    streamData: null,
    activeQuality: null,
    activeServerId: null
};

// PWA Install Prompt
let pwaInstallPrompt = null;

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    loadHomeData();
    initPWA();
});

// ===========================
// PWA SETUP
// ===========================
function initPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[SW] Registered:', reg.scope))
            .catch(err => console.warn('[SW] Registration failed:', err));
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        pwaInstallPrompt = e;

        // Show install button in header
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.style.display = 'flex';
            btn.onclick = triggerPwaInstall;
        }

        // Show install card in info page
        const card = document.getElementById('pwa-install-card');
        if (card) card.style.display = 'flex';
    });

    // Hide prompt after install
    window.addEventListener('appinstalled', () => {
        pwaInstallPrompt = null;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
        const card = document.getElementById('pwa-install-card');
        if (card) card.style.display = 'none';
    });
}

function triggerPwaInstall() {
    if (!pwaInstallPrompt) return;
    pwaInstallPrompt.prompt();
    pwaInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
            console.log('[PWA] User accepted install');
        }
        pwaInstallPrompt = null;
    });
}

// ===========================
// APK DOWNLOAD
// ===========================
function handleApkDownload(event) {
    event.preventDefault();
    // Ganti URL ini dengan link APK asli
    const APK_URL = 'https://example.com/zaamstream-v2.apk';

    // Cek apakah URL sudah dikonfigurasi
    if (APK_URL.includes('example.com')) {
        showToast('Link APK belum dikonfigurasi. Hubungi developer.', 'warning');
        return;
    }

    const link = document.createElement('a');
    link.href = APK_URL;
    link.download = 'ZaamStream-v2.0.1.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Download APK dimulai...', 'success');
}

// Simple toast notification
function showToast(message, type = 'info') {
    const existing = document.getElementById('zs-toast');
    if (existing) existing.remove();

    const colors = {
        info: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444'
    };

    const toast = document.createElement('div');
    toast.id = 'zs-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%);
        background: #1c1e25;
        border: 1px solid ${colors[type] || colors.info}40;
        color: #fff;
        padding: 12px 20px;
        border-radius: 50px;
        font-size: 0.82rem;
        font-weight: 600;
        z-index: 99999;
        box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        animation: slideUpToast 0.25s ease;
        font-family: 'Plus Jakarta Sans', sans-serif;
        border-left: 3px solid ${colors[type] || colors.info};
    `;
    toast.innerHTML = message;

    const style = document.createElement('style');
    style.textContent = `@keyframes slideUpToast { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
    document.head.appendChild(style);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ===========================
// NAVIGATION
// ===========================
function switchPage(pageId, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');

    if (element) {
        element.classList.add('active');
    } else {
        document.querySelectorAll('.nav-item').forEach(n => {
            const onclick = n.getAttribute('onclick') || '';
            if (onclick.includes(`'${pageId}'`)) n.classList.add('active');
        });
    }

    window.scrollTo({ top: 0 });

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

    if (ongoingEl.innerHTML.includes('card-h')) return;

    showLoader('ongoing-list', 'Memuat anime...');

    try {
        const res = await fetch(`${API_BASE}/anime/home`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        const data = json.data;

        ongoingEl.innerHTML = data.ongoing.animeList.map(anime => `
            <div class="card-h" onclick="openDetail('${escapeAttr(anime.href)}')">
                <span class="ep-tag">${escapeHtml(anime.releaseDay)}</span>
                <img src="${escapeAttr(anime.poster)}" loading="lazy" alt="${escapeAttr(anime.title)}">
                <div class="card-title">${escapeHtml(anime.title)}</div>
            </div>
        `).join('');

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
    if (scheduleData.length > 0) return;

    const daySelector = document.getElementById('day-selector');
    const scheduleGrid = document.getElementById('schedule-grid');
    if (!daySelector || !scheduleGrid) return;

    showLoader('schedule-grid', 'Memuat jadwal rilis...');

    try {
        const res = await fetch(`${API_BASE}/anime/schedule`);
        if (!res.ok) throw new Error('Network error');
        const json = await res.json();
        scheduleData = json.data;

        daySelector.innerHTML = scheduleData.map((item, index) => `
            <button class="day-btn ${index === 0 ? 'active' : ''}"
                    onclick="filterSchedule('${escapeAttr(item.day)}', this)">
                ${escapeHtml(item.day)}
            </button>
        `).join('');

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

    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

    if (query.length === 0) {
        infoEl.style.display = 'none';
        emptyEl.style.display = 'block';
        grid.innerHTML = '';
        return;
    }

    if (query.length < 3) return;

    emptyEl.style.display = 'none';

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
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>Anime "<strong>${escapeHtml(query)}</strong>" tidak ditemukan.</p>
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
            <div class="detail-hero">
                <div class="detail-back-btn" onclick="closeDetail()">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <img src="${escapeAttr(anime.poster)}" alt="${escapeAttr(anime.title)}">
                <div class="detail-hero-overlay"></div>
            </div>

            <div class="detail-body">
                <h1 class="detail-title">${escapeHtml(anime.title)}</h1>
                <div class="genre-list">${genreHTML}</div>

                <div class="ep-section-header">
                    <span class="ep-title">Episode List</span>
                    <span class="ep-count">${epCount} Eps</span>
                </div>

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

        // Save current state
        currentPlayerState.epHref = epHref;
        currentPlayerState.streamData = stream;
        currentPlayerState.activeServerId = null;
        currentPlayerState.activeQuality = null;

        // Build quality section
        const qualityHTML = buildQualityUI(stream);

        content.innerHTML = `
            <div class="player-nav-bar" onclick="closePlayer()">
                <div class="player-nav-back">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <span class="player-nav-text">Kembali ke Detail</span>
            </div>

            <div class="video-container">
                <iframe
                    id="main-player-iframe"
                    src="${escapeAttr(stream.defaultStreamingUrl)}"
                    allowfullscreen
                    allow="autoplay; fullscreen; picture-in-picture"
                    scrolling="no"
                ></iframe>
            </div>

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

            ${qualityHTML}
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

// ===========================
// QUALITY / SERVER BUILDER
// ===========================
function buildQualityUI(stream) {
    const qualities = stream?.server?.qualities || [];

    if (!qualities.length) return '';

    // Find first quality with servers as default active
    const firstWithServers = qualities.find(q => q.serverList && q.serverList.length > 0);
    const defaultQuality = firstWithServers ? firstWithServers.title : null;
    if (defaultQuality) currentPlayerState.activeQuality = defaultQuality;

    const tabsHTML = qualities.map(q => {
        const isEmpty = !q.serverList || q.serverList.length === 0;
        const isActive = q.title === defaultQuality;
        return `
            <button
                class="quality-tab ${isActive ? 'active' : ''} ${isEmpty ? 'empty-q' : ''}"
                onclick="${isEmpty ? '' : `selectQuality('${escapeAttr(q.title)}', this)`}"
                ${isEmpty ? 'disabled' : ''}
            >
                ${escapeHtml(q.title)}
                ${isEmpty ? ' <span style="opacity:0.4;font-size:0.6rem">—</span>' : ''}
            </button>`;
    }).join('');

    const defaultServers = firstWithServers ? firstWithServers.serverList : [];
    const serversHTML = renderServerList(defaultServers, defaultQuality);

    return `
        <div class="quality-section">
            <div class="quality-section-label">
                <i class="fa-solid fa-sliders"></i>
                Kualitas & Server
            </div>
            <div class="quality-tabs" id="quality-tabs">
                ${tabsHTML}
            </div>
            <div class="server-list" id="server-list">
                ${serversHTML}
            </div>
        </div>`;
}

function renderServerList(serverList, qualityTitle) {
    if (!serverList || serverList.length === 0) {
        return `<div class="error-state" style="padding:24px 20px">
            <p style="font-size:0.82rem">Tidak ada server untuk kualitas ini.</p>
        </div>`;
    }

    return serverList.map((srv, i) => {
        const isActive = i === 0 && currentPlayerState.activeServerId === null;
        return `
            <div class="server-item ${isActive ? 'active-server' : ''}"
                 onclick="selectServer('${escapeAttr(srv.href)}', '${escapeAttr(srv.serverId)}', '${escapeAttr(qualityTitle)}', this)">
                <div class="server-icon ${isActive ? 'server-icon-playing' : ''}">
                    <i class="fa-solid ${isActive ? 'fa-play' : 'fa-server'}"></i>
                </div>
                <span class="server-name">${escapeHtml(srv.title)}</span>
                ${isActive
                    ? `<span class="server-playing-badge">Playing</span>`
                    : `<span class="server-quality-badge">${escapeHtml(qualityTitle)}</span>`
                }
            </div>`;
    }).join('');
}

function selectQuality(qualityTitle, tabEl) {
    // Update tabs UI
    document.querySelectorAll('.quality-tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');

    currentPlayerState.activeQuality = qualityTitle;
    currentPlayerState.activeServerId = null;

    // Find quality data
    const qualities = currentPlayerState.streamData?.server?.qualities || [];
    const found = qualities.find(q => q.title === qualityTitle);
    const serverList = found ? found.serverList : [];

    // Re-render server list
    const serverListEl = document.getElementById('server-list');
    if (serverListEl) {
        serverListEl.innerHTML = renderServerList(serverList, qualityTitle);
        // Auto-select first server
        if (serverList && serverList.length > 0) {
            selectServerByHref(serverList[0].href, serverList[0].serverId, qualityTitle);
        }
    }
}

async function selectServer(href, serverId, qualityTitle, rowEl) {
    if (!href) return;

    // Update UI: mark active row
    document.querySelectorAll('.server-item').forEach(el => {
        el.classList.remove('active-server');
        const icon = el.querySelector('.server-icon');
        if (icon) {
            icon.classList.remove('server-icon-playing');
            icon.innerHTML = '<i class="fa-solid fa-server"></i>';
        }
        const badge = el.querySelector('.server-playing-badge');
        if (badge) {
            badge.className = 'server-quality-badge';
            badge.textContent = qualityTitle;
        }
    });

    rowEl.classList.add('active-server');
    const rowIcon = rowEl.querySelector('.server-icon');
    if (rowIcon) {
        rowIcon.classList.add('server-icon-playing');
        rowIcon.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
    const rowBadge = rowEl.querySelector('.server-quality-badge, .server-playing-badge');
    if (rowBadge) {
        rowBadge.className = 'server-playing-badge';
        rowBadge.textContent = 'Playing';
    }

    currentPlayerState.activeServerId = serverId;

    // Load new stream URL
    await selectServerByHref(href, serverId, qualityTitle);
}

async function selectServerByHref(href, serverId, qualityTitle) {
    const iframe = document.getElementById('main-player-iframe');
    if (!iframe) return;

    // Show loading overlay on iframe area
    iframe.src = 'about:blank';

    try {
        const res = await fetch(`${API_BASE}${href}`);
        if (!res.ok) throw new Error('Server error');
        const json = await res.json();
        const url = json.data?.streamingUrl || json.data?.defaultStreamingUrl || '';
        if (url) {
            iframe.src = url;
        } else {
            showToast('URL streaming tidak tersedia untuk server ini.', 'error');
        }
    } catch (e) {
        console.error('Server load error:', e);
        showToast('Gagal memuat server ini. Coba server lain.', 'error');
    }
}

function closePlayer() {
    document.getElementById('player-page').style.display = 'none';
    // Reset state
    currentPlayerState = { epHref: null, streamData: null, activeQuality: null, activeServerId: null };
}

// ===========================
// QUALITY MODAL (alternative bottom sheet)
// ===========================
function openQualityModal() {
    const modal = document.getElementById('quality-modal');
    const body = document.getElementById('quality-modal-body');
    if (!modal || !body) return;

    const stream = currentPlayerState.streamData;
    if (!stream) return;

    body.innerHTML = buildQualityUI(stream).replace('<div class="quality-section">', '<div class="quality-section" style="padding-top:16px">');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeQualityModal(e) {
    if (e && e.target !== document.getElementById('quality-modal')) return;
    const modal = document.getElementById('quality-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
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
    