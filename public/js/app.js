/* ============================================================================
   ARTEFACT — клиентское приложение (SPA на чистом JS)
   ============================================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   1. ГЕНЕРАТИВНАЯ ОБЛОЖКА АКТИВА
   Каждый актив получает уникальное изображение, детерминированно
   построенное по числовому "семени" (artSeed). Один и тот же seed
   всегда даёт одну и ту же картинку.
   ────────────────────────────────────────────────────────────── */

const PALETTES = [
  ['#ff7a59', '#ffd166', '#ef476f'],
  ['#5fd0c6', '#3a86ff', '#7b2ff7'],
  ['#f0c674', '#e8b04b', '#b5651d'],
  ['#b07cf0', '#ec6a72', '#ffd166'],
  ['#06d6a0', '#118ab2', '#7b2ff7'],
  ['#ff9f1c', '#ff6b6b', '#ffe066'],
  ['#5aa9e6', '#a3d5ff', '#cdb4f6'],
  ['#f72585', '#9d4edd', '#3a0ca3'],
  ['#2ec4b6', '#ff9f1c', '#e71d36'],
  ['#80ffdb', '#5390d9', '#6930c3'],
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateArt(seed, id) {
  const S = 400;
  const rng = mulberry32((seed || 1) * 2654435761 % 4294967296 || 1);
  const rand = (a, b) => a + rng() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];
  const style = Math.floor(rng() * 5);
  const uid = 'g' + (id || Math.floor(rng() * 1e9));
  const angle = irand(0, 360);

  let defs = `<linearGradient id="${uid}bg" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${pal[0]}"/>
      <stop offset="0.55" stop-color="${pal[1]}"/>
      <stop offset="1" stop-color="${pal[2]}"/>
    </linearGradient>
    <radialGradient id="${uid}vig" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#05040a" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="${uid}blur"><feGaussianBlur stdDeviation="${irand(14, 30)}"/></filter>`;

  let shapes = `<rect width="${S}" height="${S}" fill="url(#${uid}bg)"/>
    <rect width="${S}" height="${S}" fill="#0a0810" opacity="0.30"/>`;

  if (style === 0) {
    // Светящиеся сферы
    for (let i = 0; i < irand(4, 7); i++) {
      shapes += `<circle cx="${irand(0, S)}" cy="${irand(0, S)}" r="${irand(60, 150)}" fill="${pick(pal)}" opacity="${rand(0.35, 0.7).toFixed(2)}" filter="url(#${uid}blur)"/>`;
    }
  } else if (style === 1) {
    // Волны
    for (let i = 0; i < irand(4, 6); i++) {
      const y = (i + 1) * (S / 6) + rand(-20, 20);
      const a1 = y + rand(-50, 50), a2 = y + rand(-50, 50);
      shapes += `<path d="M0 ${y} C ${S * 0.33} ${a1}, ${S * 0.66} ${a2}, ${S} ${y} L ${S} ${S} L 0 ${S} Z" fill="${pick(pal)}" opacity="${rand(0.25, 0.55).toFixed(2)}"/>`;
    }
  } else if (style === 2) {
    // Грани (low-poly)
    const n = irand(4, 6), cell = S / n;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const x0 = x * cell, y0 = y * cell;
        const c1 = pick(pal), c2 = pick(pal);
        shapes += `<polygon points="${x0},${y0} ${x0 + cell},${y0} ${x0},${y0 + cell}" fill="${c1}" opacity="${rand(0.35, 0.85).toFixed(2)}"/>`;
        shapes += `<polygon points="${x0 + cell},${y0} ${x0 + cell},${y0 + cell} ${x0},${y0 + cell}" fill="${c2}" opacity="${rand(0.35, 0.85).toFixed(2)}"/>`;
      }
    }
  } else if (style === 3) {
    // Полутон (точки)
    const cols = irand(7, 11), gap = S / cols;
    const cx = rand(0.2, 0.8) * S, cy = rand(0.2, 0.8) * S;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < cols; y++) {
        const px = x * gap + gap / 2, py = y * gap + gap / 2;
        const d = Math.hypot(px - cx, py - cy) / (S * 0.7);
        const r = Math.max(0, (1 - d)) * gap * 0.55 + 1;
        shapes += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="${pick(pal)}" opacity="0.85"/>`;
      }
    }
  } else {
    // Орбиты
    const cx = rand(0.3, 0.7) * S, cy = rand(0.3, 0.7) * S;
    shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${irand(30, 55)}" fill="${pal[0]}" filter="url(#${uid}blur)" opacity="0.9"/>`;
    for (let i = 0; i < irand(5, 9); i++) {
      shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${30 + i * irand(18, 30)}" fill="none" stroke="${pick(pal)}" stroke-width="${rand(1, 4).toFixed(1)}" opacity="${rand(0.3, 0.7).toFixed(2)}"/>`;
    }
  }

  shapes += `<rect width="${S}" height="${S}" fill="url(#${uid}vig)"/>`;
  return `<svg viewBox="0 0 ${S} ${S}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${shapes}</svg>`;
}

function avatarSVG(seed) {
  const rng = mulberry32((seed || 1) * 40503 % 99991 || 1);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];
  const a = Math.floor(rng() * 360);
  return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="av${seed}" gradientTransform="rotate(${a} .5 .5)">
      <stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[2]}"/>
    </linearGradient></defs>
    <rect width="40" height="40" fill="url(#av${seed})"/>
    <circle cx="${Math.floor(rng() * 40)}" cy="${Math.floor(rng() * 40)}" r="${10 + Math.floor(rng() * 12)}" fill="${pal[1]}" opacity="0.6"/>
  </svg>`;
}

/* ──────────────────────────────────────────────────────────────
   2. API-КЛИЕНТ
   ────────────────────────────────────────────────────────────── */

const API = {
  token: localStorage.getItem('artefact_token') || null,
  async req(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401 && this.token) {
      clearSession();
      renderTopbar();
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Произошла ошибка');
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
};

/* ──────────────────────────────────────────────────────────────
   3. СОСТОЯНИЕ / СЕССИЯ
   ────────────────────────────────────────────────────────────── */

let state = {
  user: JSON.parse(localStorage.getItem('artefact_user') || 'null'),
  meta: { categories: [], rarities: [] },
};

function setSession(token, user) {
  API.token = token;
  state.user = user;
  localStorage.setItem('artefact_token', token);
  localStorage.setItem('artefact_user', JSON.stringify(user));
}
function clearSession() {
  API.token = null;
  state.user = null;
  localStorage.removeItem('artefact_token');
  localStorage.removeItem('artefact_user');
}
async function refreshMe() {
  if (!API.token) return;
  try {
    const { user } = await API.get('/me');
    state.user = user;
    localStorage.setItem('artefact_user', JSON.stringify(user));
    renderTopbar();
  } catch (_) {}
}

/* ──────────────────────────────────────────────────────────────
   4. ИКОНКИ / УТИЛИТЫ
   ────────────────────────────────────────────────────────────── */

const I = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21 4.2 13.4l-1-1a5.5 5.5 0 0 1 7.8-7.8l1 1 1-1a5.5 5.5 0 0 1 7.8 7.8l-1 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 18h6M10 14v4M14 14v4M8 21h8"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 13.8 13.8 20a2 2 0 0 1-2.8 0l-7-7V4h9l7 7a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>',
};

const RCLASS = { 'Обычный': 'r-common', 'Редкий': 'r-rare', 'Эпический': 'r-epic', 'Легендарный': 'r-legendary' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60); if (m < 60) return m + ' мин назад';
  const h = Math.floor(m / 60); if (h < 24) return h + ' ч назад';
  const d = Math.floor(h / 24); if (d < 30) return d + ' дн назад';
  return new Date(ts).toLocaleDateString('ru-RU');
}

function rarityBadge(r) {
  return `<span class="badge ${RCLASS[r]}"><span class="dot"></span>${esc(r)}</span>`;
}
function avatarEl(seed, cls) {
  return `<span class="avatar ${cls || ''}">${avatarSVG(seed || 0)}</span>`;
}

/* ──────────────────────────────────────────────────────────────
   5. УВЕДОМЛЕНИЯ
   ────────────────────────────────────────────────────────────── */

function toast(msg, type) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  const ic = type === 'ok' ? I.check : type === 'err' ? I.x : I.info;
  el.innerHTML = ic + '<span>' + esc(msg) + '</span>';
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(30px)'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ──────────────────────────────────────────────────────────────
   6. ТОПБАР И ФУТЕР
   ────────────────────────────────────────────────────────────── */

const LOGO = `<svg class="brand-mark" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#16131c"/><path d="M16 6l9 16H7z" fill="none" stroke="#e8b04b" stroke-width="2.4" stroke-linejoin="round"/><circle cx="16" cy="17" r="2.4" fill="#e8b04b"/></svg>`;

function navLinkHTML(href, label, route) {
  const active = currentRoute().name === route ? ' active' : '';
  return `<a class="nav-link${active}" href="${href}">${label}</a>`;
}

function renderTopbar() {
  const bar = document.getElementById('topbar');
  const u = state.user;
  const links = `
    ${navLinkHTML('#/market', 'Витрина', 'market')}
    ${navLinkHTML('#/collection', 'Коллекция', 'collection')}
    ${navLinkHTML('#/trades', 'Обмены', 'trades')}
    ${navLinkHTML('#/leaderboard', 'Рейтинг', 'leaderboard')}`;

  const right = u ? `
    <a class="btn btn-ghost btn-sm" href="#/create">${I.plus}<span class="bal-label">Создать</span></a>
    <a class="btn btn-ghost btn-sm nav-icon-btn" href="#/chats" title="Сообщения" id="chat-nav-btn">${I.chat}<span class="chat-badge" id="chat-badge" style="display:none"></span></a>
    <button class="btn btn-ghost btn-sm nav-icon-btn" id="support-nav-btn" title="Поддержка">${I.headset}</button>
    <div class="wallet"><span class="diamond">◈</span><span>${fmt(u.balance)}</span></div>
    <div class="umenu">
      <button class="avatar-btn" id="umenu-btn">${avatarEl(u.avatarSeed)}</button>
      <div class="umenu-pop" id="umenu-pop">
        <div class="umenu-head"><div class="u">${esc(u.username)}</div><div class="e mono">◈ ${fmt(u.balance)} кредитов</div></div>
        <a class="umenu-item" href="#/u/${u.id}">${I.user} Мой профиль</a>
        <a class="umenu-item" href="#/collection">${I.grid} Моя коллекция</a>
        <a class="umenu-item" href="#/trades">${I.swap} Мои обмены</a>
        <button class="umenu-item" id="logout-btn">${I.logout} Выйти</button>
      </div>
    </div>`
    : `<button class="btn btn-outline btn-sm" id="login-btn">Войти</button>
       <button class="btn btn-primary btn-sm" id="register-btn">${I.bolt}Начать</button>`;

  bar.innerHTML = `<nav class="nav">
    <a class="brand" href="#/market">${LOGO}<span class="brand-name">ARTE<b>FACT</b></span></a>
    <div class="nav-links">${links}</div>
    <div class="nav-right">${right}</div>
    <button class="burger" id="burger">${I.grid}</button>
  </nav>`;

  // Обработчики
  const lb = document.getElementById('login-btn'); if (lb) lb.onclick = () => openAuth('login');
  const rb = document.getElementById('register-btn'); if (rb) rb.onclick = () => openAuth('register');
  const lo = document.getElementById('logout-btn'); if (lo) lo.onclick = () => { clearSession(); renderTopbar(); toast('Вы вышли из аккаунта'); location.hash = '#/market'; };

  const ub = document.getElementById('umenu-btn');
  if (ub) {
    ub.onclick = (e) => { e.stopPropagation(); document.getElementById('umenu-pop').classList.toggle('open'); };
    document.addEventListener('click', () => { const p = document.getElementById('umenu-pop'); if (p) p.classList.remove('open'); });
  }

  const suppBtn = document.getElementById('support-nav-btn');
  if (suppBtn) suppBtn.onclick = () => { location.hash = '#/support'; };

  // Poll unread count
  if (state.user) {
    API.get('/chats-unread').then(({ unread }) => {
      const badge = document.getElementById('chat-badge');
      if (badge) { badge.style.display = unread > 0 ? '' : 'none'; badge.textContent = unread > 9 ? '9+' : unread; }
    }).catch(() => {});
  }
  const burger = document.getElementById('burger');
  if (burger) burger.onclick = openMobileNav;
}

function openMobileNav() {
  const scrim = document.createElement('div'); scrim.className = 'nav-scrim';
  const panel = document.createElement('div'); panel.className = 'nav-mobile';
  panel.innerHTML = `
    <a class="nav-link" href="#/market">Витрина</a>
    <a class="nav-link" href="#/collection">Коллекция</a>
    <a class="nav-link" href="#/trades">Обмены</a>
    <a class="nav-link" href="#/leaderboard">Рейтинг</a>
    ${state.user ? '<a class="nav-link" href="#/create">+ Создать актив</a>' : ''}`;
  document.body.append(scrim, panel);
  requestAnimationFrame(() => panel.classList.add('open'));
  const close = () => { panel.classList.remove('open'); setTimeout(() => { scrim.remove(); panel.remove(); }, 250); };
  scrim.onclick = close;
  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
}

function renderFooter() {
  document.getElementById('footer').innerHTML = `<div class="foot">
    <div>
      <a class="brand" href="#/market" style="margin-bottom:.6rem">${LOGO}<span class="brand-name">ARTE<b>FACT</b></span></a>
      <p>Платформа для создания, коллекционирования и обмена цифровыми активами. Дипломный проект.</p>
    </div>
    <div class="foot-note">© ${new Date().getFullYear()} ARTEFACT · Демонстрационный прототип<br/>Node.js · Express · Vanilla JS</div>
  </div>`;
}

/* ──────────────────────────────────────────────────────────────
   7. КАРТОЧКА АКТИВА
   ────────────────────────────────────────────────────────────── */

function assetCard(a) {
  const price = a.forSale
    ? `<div class="price"><span class="lbl">Цена</span><span class="val mono">◈ ${fmt(a.price)}</span></div>`
    : `<div class="price"><span class="lbl">Статус</span><span class="val muted">Не продаётся</span></div>`;
  const artContent = a.imageUrl
    ? `<img src="${esc(a.imageUrl)}" alt="${esc(a.name)}" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : generateArt(a.artSeed, a.id);
  return `<article class="card" data-nav="#/asset/${a.id}">
    <div class="card-art">
      ${artContent}
      <div class="rarity-tag">${rarityBadge(a.rarity)}</div>
    </div>
    <div class="card-body">
      <div class="card-cat">${esc(a.category)}</div>
      <div class="card-title">${esc(a.name)}</div>
      <div class="card-foot">
        ${price}
        <a class="owner-mini" href="#/u/${a.owner.id}" data-stop>${avatarEl(a.owner.avatarSeed, 'sm')}${esc(a.owner.username)}</a>
      </div>
      <div class="card-like-row">
        <button class="like card-like-btn" data-like="${a.id}">${a.likedByMe ? I.heartFill : I.heart}<span>${a.likeCount}</span></button>
      </div>
    </div>
  </article>`;
}

function bindCards(root) {
  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-like]') || e.target.closest('[data-stop]')) return;
      location.hash = el.getAttribute('data-nav');
    });
  });
  root.querySelectorAll('[data-like]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!requireAuth()) return;
      const id = btn.getAttribute('data-like');
      try {
        const r = await API.post('/assets/' + id + '/like');
        btn.innerHTML = (r.likedByMe ? I.heartFill : I.heart) + '<span>' + r.likeCount + '</span>';
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}

/* ──────────────────────────────────────────────────────────────
   8. РОУТЕР
   ────────────────────────────────────────────────────────────── */

function currentRoute() {
  const hash = (location.hash || '#/market').replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean); // ['asset','id']
  const name = parts[0] || 'market';
  return { name, param: parts[1] || null };
}

const app = () => document.getElementById('app');
function showLoader() { app().innerHTML = '<div class="route-loader"><span class="spinner"></span></div>'; }

async function router() {
  window.scrollTo(0, 0);
  renderTopbar();
  const r = currentRoute();
  showLoader();
  try {
    switch (r.name) {
      case 'market': await viewMarket(); break;
      case 'asset': await viewAsset(r.param); break;
      case 'collection': await viewCollection(); break;
      case 'u': await viewProfile(r.param); break;
      case 'trades': await viewTrades(); break;
      case 'create': await viewCreate(); break;
      case 'leaderboard': await viewLeaderboard(); break;
      case 'chats': await viewChats(r.param); break;
      case 'support': await viewSupport(); break;
      default: location.hash = '#/market';
    }
  } catch (err) {
    app().innerHTML = `<div class="container"><div class="empty">${I.info}<h3>Не удалось загрузить</h3><p>${esc(err.message)}</p></div></div>`;
  }
}

function requireAuth() {
  if (!state.user) { openAuth('login'); return false; }
  return true;
}

/* ──────────────────────────────────────────────────────────────
   9. ВИД: ВИТРИНА (главная)
   ────────────────────────────────────────────────────────────── */

let marketFilters = { category: 'Все', rarity: 'Все', search: '', sort: 'newest', forSale: false };

async function viewMarket() {
  const [{ assets }, stats, { activity }, { leaderboard }] = await Promise.all([
    API.get('/assets?' + filterQuery()),
    API.get('/stats'),
    API.get('/activity'),
    API.get('/leaderboard'),
  ]);

  const heroTiles = [12345, 99021, 55012].map((s, i) => `<div class="tile hc${i + 1}">${generateArt(s, 'hero' + i)}</div>`).join('');

  const catChips = ['Все', ...state.meta.categories].map((c) =>
    `<button class="chip${marketFilters.category === c ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');

  app().innerHTML = `
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">Цифровые активы нового поколения</span>
        <h1>Собирай, создавай и <span class="ital">обменивай</span> цифровые артефакты</h1>
        <p class="lead">ARTEFACT — площадка, где каждый цифровой объект уникален. Создавайте собственные активы, пополняйте коллекцию и обменивайтесь редкостями с другими коллекционерами.</p>
        <div class="hero-cta">
          ${state.user
            ? `<a class="btn btn-primary" href="#/create">${I.plus}Создать актив</a><a class="btn btn-ghost" href="#market-grid">Смотреть витрину</a>`
            : `<button class="btn btn-primary" id="hero-start">${I.bolt}Начать бесплатно</button><a class="btn btn-ghost" href="#market-grid">Смотреть витрину</a>`}
        </div>
        <div class="hero-stats">
          <div class="hstat"><div class="n mono">${fmt(stats.assets)}</div><div class="l">активов</div></div>
          <div class="hstat"><div class="n mono">${fmt(stats.users)}</div><div class="l">коллекционеров</div></div>
          <div class="hstat"><div class="n mono">${fmt(stats.sales + stats.trades)}</div><div class="l">сделок</div></div>
        </div>
      </div>
      <div class="hero-collage">${heroTiles}</div>
    </div>
  </section>

  <section id="market-grid" class="section-pad">
    <div class="container">
      <div class="section-head">
        <div><span class="eyebrow">Витрина</span><h2>Исследуйте коллекцию</h2></div>
      </div>
      <div class="filters">
        <div class="search-box">${I.search}<input id="f-search" placeholder="Поиск по названию…" value="${esc(marketFilters.search)}"/></div>
        <select id="f-rarity">
          <option>Все</option>${state.meta.rarities.map((r) => `<option ${marketFilters.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <select id="f-sort">
          <option value="newest" ${marketFilters.sort === 'newest' ? 'selected' : ''}>Сначала новые</option>
          <option value="oldest" ${marketFilters.sort === 'oldest' ? 'selected' : ''}>Сначала старые</option>
          <option value="price_asc" ${marketFilters.sort === 'price_asc' ? 'selected' : ''}>Цена ↑</option>
          <option value="price_desc" ${marketFilters.sort === 'price_desc' ? 'selected' : ''}>Цена ↓</option>
          <option value="popular" ${marketFilters.sort === 'popular' ? 'selected' : ''}>Популярные</option>
        </select>
        <button class="chip${marketFilters.forSale ? ' active' : ''}" id="f-forsale">${I.tag} Только в продаже</button>
      </div>
      <div class="chips">${catChips}</div>
      <div id="grid-container">${gridOrEmpty(assets)}</div>
    </div>
  </section>

  <section>
    <div class="container two-col">
      <div>
        <div class="section-head"><div><span class="eyebrow">В реальном времени</span><h2>Лента активности</h2></div></div>
        <div class="activity-feed">${activity.slice(0, 10).map(activityItem).join('') || emptyBox('Пока тихо')}</div>
      </div>
      <div>
        <div class="section-head"><div><span class="eyebrow">Топ</span><h2>Коллекционеры</h2></div></div>
        ${leaderboard.slice(0, 5).map((row, i) => lbRow(row, i)).join('')}
        <a class="btn btn-outline btn-block" href="#/leaderboard" style="margin-top:1rem">Весь рейтинг ${I.trophy}</a>
      </div>
    </div>
  </section>`;

  // Привязка событий фильтров
  const grid = document.getElementById('grid-container');
  bindCards(grid);
  app().querySelectorAll('[data-nav], [data-like]').forEach(() => {}); // (карточки уже привязаны)
  bindActivity(app());

  const hs = document.getElementById('hero-start'); if (hs) hs.onclick = () => openAuth('register');

  const search = document.getElementById('f-search');
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { marketFilters.search = search.value.trim(); reloadGrid(); }, 300); });
  document.getElementById('f-rarity').onchange = (e) => { marketFilters.rarity = e.target.value; reloadGrid(); };
  document.getElementById('f-sort').onchange = (e) => { marketFilters.sort = e.target.value; reloadGrid(); };
  document.getElementById('f-forsale').onclick = (e) => { marketFilters.forSale = !marketFilters.forSale; e.currentTarget.classList.toggle('active'); reloadGrid(); };
  app().querySelectorAll('[data-cat]').forEach((c) => c.onclick = () => {
    marketFilters.category = c.getAttribute('data-cat');
    app().querySelectorAll('[data-cat]').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    reloadGrid();
  });
}

function filterQuery() {
  const p = new URLSearchParams();
  if (marketFilters.category !== 'Все') p.set('category', marketFilters.category);
  if (marketFilters.rarity !== 'Все') p.set('rarity', marketFilters.rarity);
  if (marketFilters.search) p.set('search', marketFilters.search);
  if (marketFilters.sort) p.set('sort', marketFilters.sort);
  if (marketFilters.forSale) p.set('forSale', 'true');
  return p.toString();
}

async function reloadGrid() {
  const cont = document.getElementById('grid-container');
  if (!cont) return;
  cont.style.opacity = '0.4';
  try {
    const { assets } = await API.get('/assets?' + filterQuery());
    cont.innerHTML = gridOrEmpty(assets);
    cont.style.opacity = '1';
    bindCards(cont);
  } catch (err) { toast(err.message, 'err'); cont.style.opacity = '1'; }
}

function gridOrEmpty(assets) {
  if (!assets.length) return emptyBox('Ничего не найдено', 'Попробуйте изменить фильтры или поиск.');
  return `<div class="asset-grid">${assets.map(assetCard).join('')}</div>`;
}
function emptyBox(title, sub) {
  return `<div class="empty">${I.empty}<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}

/* Элемент ленты активности */
const ACT_VERB = { mint: 'создал актив', buy: 'купил', list: 'выставил', trade_offer: 'предложил обмен', trade_done: 'совершил обмен', join: 'присоединился', };
function activityItem(e) {
  const art = e.asset ? `<a class="act-art" href="#/asset/${e.asset.id}" data-nav2="#/asset/${e.asset.id}">${generateArt(e.asset.artSeed, e.asset.id)}</a>` : avatarEl(e.avatarSeed);
  return `<div class="act-item">${art}<div><b>${esc(e.username)}</b> ${esc(e.text)}</div><span class="act-time">${timeAgo(e.createdAt)}</span></div>`;
}
function bindActivity(root) {
  root.querySelectorAll('[data-nav2]').forEach((el) => el.addEventListener('click', (ev) => { ev.preventDefault(); location.hash = el.getAttribute('data-nav2'); }));
}

/* Строка рейтинга */
function lbRow(row, i) {
  return `<div class="lb-row" data-nav="#/u/${row.user.id}" style="cursor:pointer">
    <div class="lb-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
    ${avatarEl(row.user.avatarSeed)}
    <div><div class="lb-name">${esc(row.user.username)}</div><div class="lb-sub">${fmt(row.count)} активов · ${fmt(row.legendary)} легендарных</div></div>
    <div class="lb-val"><div class="v mono">◈ ${fmt(row.value)}</div><div class="l">оценка коллекции</div></div>
  </div>`;
}

/* ──────────────────────────────────────────────────────────────
   10. ВИД: СТРАНИЦА АКТИВА
   ────────────────────────────────────────────────────────────── */

async function viewAsset(id) {
  const { asset: a, history } = await API.get('/assets/' + id);
  const me = state.user;
  const isOwner = me && a.owner && me.id === a.owner.id;

  let actions = '';
  if (!me) {
    actions = `<button class="btn btn-primary btn-block" id="need-login">${a.forSale ? 'Войдите, чтобы купить' : 'Войти'}</button>`;
  } else if (isOwner) {
    actions = `<div class="action-row">
      ${a.forSale
        ? `<button class="btn btn-ghost" id="relist">Изменить цену</button><button class="btn btn-danger" id="unlist">Снять с продажи</button>`
        : `<button class="btn btn-primary" id="list">${I.tag}Выставить на продажу</button>`}
    </div>`;
  } else {
    actions = `<div class="action-row">
      ${a.forSale ? `<button class="btn btn-primary" id="buy">Купить за ◈ ${fmt(a.price)}</button>` : ''}
      <button class="btn btn-ghost" id="msg-seller">${I.chat}Написать</button>
      <button class="btn btn-ghost" id="offer">${I.swap}Предложить обмен</button>
    </div>`;
  }

  app().innerHTML = `<section class="section-pad"><div class="container">
    <button class="btn btn-outline btn-sm" id="back-btn" style="margin-bottom:1.5rem">${I.back} Назад</button>
    <div class="detail">
      <div class="detail-art">${generateArt(a.artSeed, a.id)}</div>
      <div class="detail-info">
        <div class="detail-badges">${rarityBadge(a.rarity)}<span class="badge r-common" style="color:var(--text-3)">${esc(a.category)}</span></div>
        <h1>${esc(a.name)}</h1>
        <div style="display:flex;align-items:center;gap:1.2rem;margin-bottom:.5rem">
          <button class="detail-like-btn" id="detail-like">${a.likedByMe ? I.heartFill : I.heart}<span>${a.likeCount}</span></button>
          <button class="asset-id-btn" id="copy-id" title="Нажмите, чтобы скопировать">ID ${a.id.slice(0, 8)}</button>
        </div>
        <p class="detail-desc">${esc(a.description)}</p>

        <div class="kv-grid">
          <div class="kv"><div class="k">Владелец</div><a class="v" href="#/u/${a.owner.id}">${avatarEl(a.owner.avatarSeed, 'sm')}${esc(a.owner.username)}</a></div>
          <div class="kv"><div class="k">Создатель</div><a class="v" href="#/u/${a.creator.id}">${avatarEl(a.creator.avatarSeed, 'sm')}${esc(a.creator.username)}</a></div>
        </div>

        <div class="buy-panel">
          <div class="row">
            <div><div class="label-tag">${a.forSale ? 'Текущая цена' : 'Статус'}</div>
            <div class="big-price">${a.forSale ? '◈ ' + fmt(a.price) : '<span style="color:var(--text-3);font-size:1.1rem">Не продаётся</span>'}</div></div>
            ${a.forSale ? '<span class="diamond" style="font-size:2rem;color:var(--gold);opacity:.4">◈</span>' : ''}
          </div>
          ${actions}
        </div>
        ${isOwner ? `<button id="delete-asset" style="margin-top:0.8rem;background:none;border:none;color:var(--err);opacity:0.55;font-size:0.82rem;cursor:pointer;padding:0.3rem 0;display:block;transition:opacity .15s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.55'">Удалить товар</button>` : ''}

        <div class="label-tag" style="margin-top:1.5rem">История</div>
        <div class="history-list">
          ${history.length ? history.map((h) => `<div class="history-item"><span class="h-dot"></span><span><b style="color:var(--text)">${esc(h.username)}</b> ${esc(h.text)}</span><span class="t">${timeAgo(h.createdAt)}</span></div>`).join('') : '<p style="color:var(--text-4);font-size:.88rem">Событий пока нет.</p>'}
        </div>
      </div>
    </div>
  </div></section>`;

  document.getElementById('back-btn').onclick = () => history.length && window.history.length > 1 ? window.history.back() : (location.hash = '#/market');

  const dl = document.getElementById('detail-like');
  if (dl) dl.onclick = async () => {
    if (!requireAuth()) return;
    try { const r = await API.post('/assets/' + a.id + '/like'); dl.innerHTML = (r.likedByMe ? I.heartFill : I.heart) + '<span>' + r.likeCount + '</span>'; } catch (e) { toast(e.message, 'err'); }
  };

  const copyId = document.getElementById('copy-id');
  if (copyId) copyId.onclick = () => {
    navigator.clipboard.writeText(a.id.slice(0, 8)).then(() => {
      copyId.textContent = '✓ Скопировано!';
      setTimeout(() => { copyId.textContent = 'ID ' + a.id.slice(0, 8); }, 1800);
    });
  };

  bind('need-login', () => openAuth('login'));
  bind('buy', () => confirmBuy(a));
  bind('list', () => openListModal(a, false));
  bind('relist', () => openListModal(a, true));
  bind('offer', () => openTradeModal(a));
  bind('msg-seller', () => { if (!requireAuth()) return; location.hash = '#/chats/' + a.owner.id; });
  bind('unlist', async () => {
    try { await API.post('/assets/' + a.id + '/unlist'); toast('Актив снят с продажи', 'ok'); router(); } catch (e) { toast(e.message, 'err'); }
  });
  bind('delete-asset', async () => {
    if (!confirm('Удалить «' + a.name + '»? Это действие нельзя отменить.')) return;
    try { await API.post('/assets/' + a.id + '/delete'); toast('Товар удалён', 'ok'); location.hash = '#/collection'; } catch (e) { toast(e.message, 'err'); }
  });

  function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }
}

async function confirmBuy(a) {
  if (!requireAuth()) return;
  if (state.user.balance < a.price) { toast('Недостаточно кредитов', 'err'); return; }
  try {
    const r = await API.post('/assets/' + a.id + '/buy');
    state.user.balance = r.balance;
    localStorage.setItem('artefact_user', JSON.stringify(state.user));
    toast(`Актив «${a.name}» куплен!`, 'ok');
    router();
  } catch (e) { toast(e.message, 'err'); }
}

/* ──────────────────────────────────────────────────────────────
   11. ВИД: КОЛЛЕКЦИЯ / ПРОФИЛЬ
   ────────────────────────────────────────────────────────────── */

async function viewCollection() {
  if (!requireAuth()) { app().innerHTML = guestPrompt('Войдите, чтобы увидеть свою коллекцию'); bindGuest(); return; }
  return viewProfile(state.user.id);
}

async function viewProfile(id) {
  const data = await API.get('/users/' + id);
  const me = state.user && state.user.id === data.user.id;
  const u = data.user;

  // Registration date display
  const regDate = new Date(u.createdAt);
  const regFormatted = regDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const yearsAgo = Math.floor((Date.now() - u.createdAt) / (1000 * 60 * 60 * 24 * 365));
  const monthsAgo = Math.floor((Date.now() - u.createdAt) / (1000 * 60 * 60 * 24 * 30));
  const daysAgo = Math.floor((Date.now() - u.createdAt) / (1000 * 60 * 60 * 24));
  let regAgo = daysAgo < 1 ? 'сегодня' : daysAgo < 30 ? `${daysAgo} дн. назад` : monthsAgo < 12 ? `${monthsAgo} мес. назад` : `${yearsAgo} ${yearsAgo === 1 ? 'год' : yearsAgo < 5 ? 'года' : 'лет'} назад`;

  // Rating stars
  const rating = data.rating || 0;
  const reviewCount = data.reviewCount || 0;
  function starsHTML(r) {
    return [1,2,3,4,5].map(i => {
      const filled = i <= Math.floor(r);
      const half = !filled && i === Math.ceil(r) && r % 1 >= 0.3;
      return `<span class="star ${filled ? 'star-full' : half ? 'star-half' : 'star-empty'}">★</span>`;
    }).join('');
  }

  const followersCount = data.stats.followersCount || 0;
  const isFollowing = data.isFollowing || false;
  const canFollow = state.user && !me;

  app().innerHTML = `<section class="section-pad"><div class="container">
    <div class="profile-head">
      ${avatarEl(u.avatarSeed, 'lg')}
      <div class="profile-meta">
        <h1>${esc(u.username)}${me ? ' <span style="font-size:1rem;color:var(--gold)">(вы)</span>' : ''}</h1>
        <div class="bio">${esc(u.bio || 'Коллекционер цифровых активов')}</div>
        <div class="profile-reg">
          <span class="reg-label">Дата регистрации:</span>
          <span class="reg-date">${regFormatted}</span>
          <span class="reg-ago">${regAgo}</span>
        </div>
        <div class="profile-rating-row">
          <div class="stars-wrap">${starsHTML(rating)}</div>
          <span class="rating-num">${rating > 0 ? rating.toFixed(1) : '—'}</span>
          <span class="rating-count">${reviewCount > 0 ? `· ${reviewCount} ${reviewCount === 1 ? 'отзыв' : reviewCount < 5 ? 'отзыва' : 'отзывов'}` : '· нет отзывов'}</span>
        </div>
        ${canFollow ? `<div style="display:flex;gap:.5rem;margin-top:.7rem;flex-wrap:wrap">
          <button class="btn ${isFollowing ? 'btn-ghost' : 'btn-outline'} btn-sm" id="follow-btn">
            ${isFollowing ? '✓ Вы подписаны' : '+ Подписаться'}
          </button>
          <button class="btn btn-ghost btn-sm" id="profile-msg-btn">${I.chat} Написать</button>
        </div>` : ''}
      </div>
      <div class="profile-stats">
        <div class="pstat"><div class="n mono">${fmt(data.stats.owned)}</div><div class="l">в коллекции</div></div>
        <div class="pstat"><div class="n mono">${fmt(data.stats.created)}</div><div class="l">создано</div></div>
        <div class="pstat"><div class="n mono">◈ ${fmt(data.stats.collectionValue)}</div><div class="l">Состояние</div></div>
        <div class="pstat"><div class="n mono">${fmt(followersCount)}</div><div class="l">подписчиков</div></div>
      </div>
    </div>

    <div class="section-head"><div><span class="eyebrow">${me ? 'Моя коллекция' : 'Коллекция'}</span><h2>${fmt(data.owned.length)} активов</h2></div>
      ${me ? `<a class="btn btn-primary btn-sm" href="#/create">${I.plus}Создать новый</a>` : ''}</div>
    <div id="grid-container">${data.owned.length ? `<div class="asset-grid">${data.owned.map(assetCard).join('')}</div>` : emptyBox(me ? 'Ваша коллекция пуста' : 'Коллекция пуста', me ? 'Создайте свой первый актив или купите его на витрине.' : '')}</div>

    <!-- ОТЗЫВЫ -->
    <div class="reviews-section">
      <div class="section-head" style="margin-top:2.5rem"><div><span class="eyebrow">Отзывы</span><h2>Рейтинг продавца</h2></div></div>
      <div class="reviews-header">
        <div class="reviews-score">
          <div class="big-rating">${rating > 0 ? rating.toFixed(1) : '—'}</div>
          <div>
            <div class="stars-lg">${starsHTML(rating)}</div>
            <div class="review-total">из 5 · всего ${reviewCount} ${reviewCount === 1 ? 'отзыв' : reviewCount < 5 ? 'отзыва' : 'отзывов'}</div>
          </div>
        </div>
        ${!me && state.user ? `<button class="btn btn-outline btn-sm" id="leave-review-btn" style="display:none">Оставить отзыв</button>` : ''}
      </div>
      <div class="reviews-list" id="reviews-list">
        ${(data.reviews || []).length ? (data.reviews || []).map(rv => `
          <div class="review-item">
            <div class="review-top">
              ${avatarEl(rv.authorAvatarSeed, 'sm')}
              <div>
                <div class="review-author">${esc(rv.authorUsername)}</div>
                <div class="review-meta">${timeAgo(rv.createdAt)}</div>
              </div>
              <div class="stars-wrap" style="margin-left:auto">${starsHTML(rv.rating)}</div>
            </div>
            ${rv.text ? `<div class="review-text">${esc(rv.text)}</div>` : ''}
          </div>`).join('') : `<div class="review-empty">Отзывов пока нет. Станьте первым!</div>`}
      </div>
    </div>
  </div></section>`;

  bindCards(app());

  // Follow button
  const followBtn = document.getElementById('follow-btn');
  if (followBtn) {
    followBtn.onclick = async () => {
      if (!requireAuth()) return;
      followBtn.disabled = true;
      try {
        const r = await API.post('/users/' + u.id + '/follow');
        followBtn.textContent = r.following ? '✓ Вы подписаны' : '+ Подписаться';
        followBtn.className = `btn ${r.following ? 'btn-ghost' : 'btn-outline'} btn-sm`;
        followBtn.disabled = false;
      } catch (e) { toast(e.message, 'err'); followBtn.disabled = false; }
    };
  }

  const profileMsgBtn = document.getElementById('profile-msg-btn');
  if (profileMsgBtn) {
    profileMsgBtn.onclick = () => { if (!requireAuth()) return; location.hash = '#/chats/' + u.id; };
  }

  // Check if can review
  const reviewBtn = document.getElementById('leave-review-btn');
  if (reviewBtn && state.user) {
    API.get('/users/' + u.id + '/can-review').then(({ canReview, alreadyReviewed }) => {
      if (canReview) {
        reviewBtn.style.display = '';
        reviewBtn.onclick = () => openReviewModal(u.id, starsHTML);
      } else if (alreadyReviewed) {
        reviewBtn.style.display = '';
        reviewBtn.textContent = '✓ Отзыв оставлен';
        reviewBtn.disabled = true;
      } else {
        reviewBtn.style.display = '';
        reviewBtn.textContent = 'Отзыв (только после покупки)';
        reviewBtn.disabled = true;
        reviewBtn.title = 'Оставить отзыв можно только после покупки товара у этого продавца';
      }
    }).catch(() => {});
  }
}

function guestPrompt(msg) {
  return `<section class="section-pad"><div class="container"><div class="empty" style="padding:5rem 1rem">
    ${I.user}<h3>${esc(msg)}</h3><p>Создайте аккаунт за пару секунд и начните коллекционировать.</p>
    <div style="display:flex;gap:.7rem;justify-content:center;margin-top:1.4rem">
      <button class="btn btn-primary" id="g-register">${I.bolt}Создать аккаунт</button>
      <button class="btn btn-outline" id="g-login">Войти</button>
    </div></div></div></section>`;
}
function bindGuest() {
  const r = document.getElementById('g-register'); if (r) r.onclick = () => openAuth('register');
  const l = document.getElementById('g-login'); if (l) l.onclick = () => openAuth('login');
}

/* ──────────────────────────────────────────────────────────────
   12. ВИД: ОБМЕНЫ
   ────────────────────────────────────────────────────────────── */

async function viewTrades() {
  if (!requireAuth()) { app().innerHTML = guestPrompt('Войдите, чтобы управлять обменами'); bindGuest(); return; }
  const { incoming, outgoing } = await API.get('/trades');

  const incHTML = incoming.length ? incoming.map((t) => tradeCard(t, 'incoming')).join('') : emptyBox('Нет входящих предложений', 'Когда кто-то предложит вам обмен, оно появится здесь.');
  const outHTML = outgoing.length ? outgoing.map((t) => tradeCard(t, 'outgoing')).join('') : emptyBox('Нет исходящих предложений', 'Откройте любой актив и нажмите «Предложить обмен».');

  app().innerHTML = `<section class="section-pad"><div class="container">
    <div class="section-head"><div><span class="eyebrow">P2P-обмен</span><h2>Мои обмены</h2><p>Обменивайтесь активами с другими коллекционерами напрямую.</p></div></div>
    <div class="tabs"><button class="tab active" data-tab="in">Входящие (${incoming.filter((t) => t.status === 'open').length})</button><button class="tab" data-tab="out">Исходящие (${outgoing.filter((t) => t.status === 'open').length})</button></div>
    <div id="tab-in">${incHTML}</div>
    <div id="tab-out" style="display:none">${outHTML}</div>
  </div></section>`;

  const tabs = app().querySelectorAll('.tab');
  tabs.forEach((tb) => tb.onclick = () => {
    tabs.forEach((x) => x.classList.remove('active')); tb.classList.add('active');
    const t = tb.getAttribute('data-tab');
    document.getElementById('tab-in').style.display = t === 'in' ? '' : 'none';
    document.getElementById('tab-out').style.display = t === 'out' ? '' : 'none';
  });
  bindTradeActions(app());
}

function tradeAssetBox(a, label) {
  if (!a) return `<div class="trade-asset"><div class="ta-name">актив удалён</div></div>`;
  return `<a class="trade-asset" href="#/asset/${a.id}" data-nav2="#/asset/${a.id}">
    <div class="mini-art">${generateArt(a.artSeed, a.id)}</div>
    <div style="min-width:0"><div class="label-tag" style="margin:0 0 2px">${label}</div><div class="ta-name">${esc(a.name)}</div><div class="ta-sub">${esc(a.rarity)}</div></div>
  </a>`;
}

function tradeCard(t, dir) {
  const statusMap = { open: ['Ожидает', 'ts-open'], accepted: ['Принят', 'ts-accepted'], declined: ['Отклонён', 'ts-declined'], cancelled: ['Отменён', 'ts-cancelled'] };
  const [stLabel, stClass] = statusMap[t.status] || ['—', 'ts-cancelled'];
  const who = dir === 'incoming'
    ? `${avatarEl(t.from.avatarSeed, 'sm')} <b>${esc(t.from.username)}</b> предлагает вам обмен`
    : `Вы предложили обмен ${avatarEl(t.to.avatarSeed, 'sm')} <b>${esc(t.to.username)}</b>`;

  let foot = `<span class="trade-status ${stClass}">${stLabel}</span><span class="mono" style="color:var(--text-4);font-size:.74rem">${timeAgo(t.createdAt)}</span>`;
  let buttons = '';
  if (t.status === 'open') {
    if (dir === 'incoming') {
      buttons = `<div style="display:flex;gap:.5rem"><button class="btn btn-primary btn-sm" data-accept="${t.id}">${I.check}Принять</button><button class="btn btn-danger btn-sm" data-decline="${t.id}">Отклонить</button></div>`;
    } else {
      buttons = `<button class="btn btn-danger btn-sm" data-decline="${t.id}">Отменить</button>`;
    }
  }

  return `<div class="trade-card">
    <div class="trade-top">${who}</div>
    <div class="trade-swap">
      ${tradeAssetBox(dir === 'incoming' ? t.offered : t.offered, dir === 'incoming' ? 'Вам отдают' : 'Вы отдаёте')}
      <span class="swap-icon">${I.swap}</span>
      ${tradeAssetBox(dir === 'incoming' ? t.requested : t.requested, dir === 'incoming' ? 'Просят у вас' : 'Хотите получить')}
    </div>
    <div class="trade-foot"><div style="display:flex;align-items:center;gap:.7rem">${foot}</div>${buttons}</div>
  </div>`;
}

function bindTradeActions(root) {
  bindActivity(root);
  root.querySelectorAll('[data-accept]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await API.post('/trades/' + b.getAttribute('data-accept') + '/accept'); toast('Обмен совершён!', 'ok'); await refreshMe(); router(); }
    catch (e) { toast(e.message, 'err'); b.disabled = false; }
  });
  root.querySelectorAll('[data-decline]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await API.post('/trades/' + b.getAttribute('data-decline') + '/decline'); toast('Предложение закрыто'); router(); }
    catch (e) { toast(e.message, 'err'); b.disabled = false; }
  });
}

/* ──────────────────────────────────────────────────────────────
   13. ВИД: РЕЙТИНГ
   ────────────────────────────────────────────────────────────── */

async function viewLeaderboard() {
  const { leaderboard } = await API.get('/leaderboard');
  app().innerHTML = `<section class="section-pad"><div class="container" style="max-width:820px">
    <div class="section-head"><div><span class="eyebrow">Сообщество</span><h2>Рейтинг коллекционеров</h2><p>Места распределяются по суммарной оценочной стоимости коллекции.</p></div></div>
    ${leaderboard.length ? leaderboard.map((row, i) => lbRow(row, i)).join('') : emptyBox('Пока пусто')}
  </div></section>`;
  bindCards(app());
}

/* ──────────────────────────────────────────────────────────────
   14. ВИД: СОЗДАНИЕ АКТИВА
   ────────────────────────────────────────────────────────────── */

let previewSeed = Math.floor(Math.random() * 1e6);
let uploadedImageUrl = null;

async function viewCreate() {
  if (!requireAuth()) { app().innerHTML = guestPrompt('Войдите, чтобы создавать активы'); bindGuest(); return; }

  const cats = state.meta.categories.map((c) => `<option>${c}</option>`).join('');
  uploadedImageUrl = null;

  app().innerHTML = `<section class="section-pad"><div class="container">
    <div class="section-head"><div><span class="eyebrow">Создание</span><h2>Новый цифровой актив</h2><p>Обложка генерируется алгоритмически и уникальна. Редкость определяется при создании.</p></div></div>
    <div class="create-wrap">
      <div class="form-card">
        <div class="create-form">
          <div><label>Название актива</label><input id="c-name" maxlength="60" placeholder="Например: Рассвет нулей"/></div>
          <div><label>Категория</label><select id="c-cat">${cats}</select></div>
          <div><label>Описание (необязательно)</label><textarea id="c-desc" rows="3" maxlength="400" placeholder="Расскажите об этом активе…"></textarea></div>
          <div class="mint-note">${I.info}<span>При создании актив попадёт в вашу коллекцию. Чтобы продать или обменять его, откройте актив в коллекции.</span></div>
          <button class="btn btn-primary btn-block" id="c-submit">${I.bolt}Создать актив</button>
        </div>
      </div>
      <div class="preview-col">
        <div class="preview-top-bar">
          <button class="reroll" id="reroll">${I.dice} Перегенерировать обложку</button>
        </div>
        <div class="preview-art" id="preview">${generateArt(previewSeed, 'prev')}</div>
        <div style="margin-top:0.8rem">
          <label class="reroll upload-btn" id="upload-label" style="width:100%;justify-content:center;border-radius:var(--radius);">
            ↑ Загрузить своё изображение
            <input type="file" id="img-upload" accept="image/png,image/jpeg" style="display:none">
          </label>
          <div id="upload-status" style="font-size:.8rem;color:var(--text-3);margin-top:.4rem;min-height:1.2em;text-align:center"></div>
          <div style="font-size:.75rem;color:var(--text-4);margin-top:.2rem;text-align:center">PNG или JPEG · максимум 100 МБ</div>
        </div>
      </div>
    </div>
  </div></section>`;

  document.getElementById('reroll').onclick = () => {
    uploadedImageUrl = null;
    previewSeed = Math.floor(Math.random() * 1e6);
    document.getElementById('preview').innerHTML = generateArt(previewSeed, 'prev' + previewSeed);
    document.getElementById('upload-status').textContent = '';
  };

  document.getElementById('img-upload').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    if (file.size > 100 * 1024 * 1024) { toast('Файл превышает 100 МБ', 'err'); return; }
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast('Только PNG и JPEG', 'err'); return; }
    status.textContent = 'Загружается…';
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload-image', { method: 'POST', headers: { Authorization: 'Bearer ' + API.token }, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      uploadedImageUrl = data.url;
      document.getElementById('preview').innerHTML = `<img src="${data.url}" alt="preview" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      status.textContent = '✓ Изображение загружено';
    } catch (err) { status.textContent = ''; toast(err.message || 'Ошибка загрузки', 'err'); }
  };

  document.getElementById('c-submit').onclick = async (e) => {
    const name = document.getElementById('c-name').value.trim();
    const category = document.getElementById('c-cat').value;
    const description = document.getElementById('c-desc').value.trim();
    if (name.length < 2) { toast('Введите название (мин. 2 символа)', 'err'); return; }
    e.currentTarget.disabled = true;
    try {
      const { asset } = await API.post('/assets', { name, category, description, artSeed: previewSeed, imageUrl: uploadedImageUrl });
      toast(`Создан актив редкости «${asset.rarity}»!`, 'ok');
      location.hash = '#/asset/' + asset.id;
    } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
  };
}

/* ──────────────────────────────────────────────────────────────
   15. МОДАЛЬНЫЕ ОКНА
   ────────────────────────────────────────────────────────────── */

function openModal(html, wide) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="ovl"><div class="modal ${wide ? 'wide' : ''}"><button class="modal-close" id="mclose">${I.x}</button>${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('mclose').onclick = close;
  document.getElementById('ovl').onclick = (e) => { if (e.target.id === 'ovl') close(); };
  return close;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* Авторизация */
function openAuth(mode) {
  render(mode || 'login');
  function render(m) {
    const isLogin = m === 'login';
    const close = openModal(`
      <h2>${isLogin ? 'С возвращением' : 'Создать аккаунт'}</h2>
      <p class="sub">${isLogin ? 'Войдите, чтобы продолжить коллекционировать.' : 'Регистрация бесплатна — создайте аккаунт за пару секунд.'}</p>
      <div id="auth-form">
        ${isLogin ? '' : '<div class="form-row"><label>Имя пользователя</label><input id="a-username" placeholder="ваш ник"/></div>'}
        ${isLogin ? '<div class="form-row"><label>E-mail или имя</label><input id="a-login" placeholder="email или ник"/></div>'
                  : '<div class="form-row"><label>E-mail</label><input id="a-email" type="email" placeholder="you@example.com"/></div>'}
        <div class="form-row"><label>Пароль</label><input id="a-password" type="password" placeholder="••••••••"/></div>
        <button class="btn btn-primary btn-block" id="a-submit">${isLogin ? 'Войти' : 'Создать аккаунт'}</button>
      </div>
      <div class="modal-switch">${isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'} <a id="a-switch">${isLogin ? 'Зарегистрироваться' : 'Войти'}</a></div>
      ${isLogin ? `<div class="guest-login-wrap"><div class="guest-divider"><span>или</span></div><button class="btn btn-ghost btn-block" id="guest-btn">👤 Войти как гость</button></div>` : ''}
    `);

    document.getElementById('a-switch').onclick = () => render(isLogin ? 'register' : 'login');
    const submit = document.getElementById('a-submit');
    const doSubmit = async () => {
      submit.disabled = true;
      try {
        let res;
        if (isLogin) {
          res = await API.post('/login', { login: val('a-login'), password: val('a-password') });
        } else {
          res = await API.post('/register', { username: val('a-username'), email: val('a-email'), password: val('a-password') });
        }
        setSession(res.token, res.user);
        closeModal(); renderTopbar();
        toast(isLogin ? `Добро пожаловать, ${res.user.username}!` : `Аккаунт создан, ${res.user.username}!`, 'ok');
        router();
      } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
    };
    submit.onclick = doSubmit;
    document.querySelectorAll('#auth-form input').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); }));
    const first = document.querySelector('#auth-form input'); if (first) first.focus();

    const guestBtn = document.getElementById('guest-btn');
    if (guestBtn) {
      guestBtn.onclick = async () => {
        guestBtn.disabled = true;
        guestBtn.textContent = 'Входим…';
        try {
          const res = await API.post('/guest-login');
          setSession(res.token, res.user);
          closeModal(); renderTopbar();
          toast(`Добро пожаловать, ${res.user.username}!`, 'ok');
          router();
        } catch (err) { toast(err.message, 'err'); guestBtn.disabled = false; guestBtn.textContent = '👤 Войти как гость'; }
      };
    }
  }
  function val(id) { return (document.getElementById(id) || {}).value || ''; }
}

/* Выставление на продажу */
function openListModal(a, isRelist) {
  const close = openModal(`
    <h2>${isRelist ? 'Изменить цену' : 'Выставить на продажу'}</h2>
    <p class="sub">«${esc(a.name)}» — укажите цену в кредитах (◈).</p>
    <div class="form-row"><label>Цена</label><input id="l-price" type="number" min="1" value="${a.price || ''}" placeholder="например, 250"/></div>
    <button class="btn btn-primary btn-block" id="l-submit">${I.tag} Подтвердить</button>
  `);
  const inp = document.getElementById('l-price'); inp.focus();
  const submit = async () => {
    const price = Math.round(Number(inp.value));
    if (!price || price < 1) { toast('Укажите корректную цену', 'err'); return; }
    try { await API.post('/assets/' + a.id + '/list', { price }); close(); toast('Актив выставлен на продажу', 'ok'); router(); }
    catch (e) { toast(e.message, 'err'); }
  };
  document.getElementById('l-submit').onclick = submit;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

/* Предложение обмена: выбрать свой актив в обмен на чужой */
async function openTradeModal(target) {
  if (!requireAuth()) return;
  const close = openModal(`<h2>Предложить обмен</h2><p class="sub">Выберите актив из своей коллекции, который вы отдадите за «${esc(target.name)}».</p><div id="picker"><div class="route-loader"><span class="spinner"></span></div></div>`, true);

  let mine;
  try { const data = await API.get('/users/' + state.user.id); mine = data.owned.filter((x) => x.id !== target.id); }
  catch (e) { toast(e.message, 'err'); return; }

  const picker = document.getElementById('picker');
  if (!mine.length) { picker.innerHTML = emptyBox('У вас нет активов для обмена', 'Создайте или купите актив, чтобы предлагать обмены.'); return; }

  let selected = null;
  picker.innerHTML = `
    <div class="picker-grid">${mine.map((a) => `<div class="pick" data-pick="${a.id}"><div class="pa">${generateArt(a.artSeed, a.id)}</div><div class="pn">${esc(a.name)}</div></div>`).join('')}</div>
    <div style="display:flex;gap:.6rem;align-items:center;margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid var(--line)">
      <div class="trade-asset" style="flex:1"><div class="mini-art">${generateArt(target.artSeed, target.id)}</div><div><div class="label-tag" style="margin:0">Хотите получить</div><div class="ta-name">${esc(target.name)}</div></div></div>
      <button class="btn btn-primary" id="trade-send" disabled>${I.swap} Отправить</button>
    </div>`;

  picker.querySelectorAll('[data-pick]').forEach((p) => p.onclick = () => {
    picker.querySelectorAll('[data-pick]').forEach((x) => x.classList.remove('selected'));
    p.classList.add('selected'); selected = p.getAttribute('data-pick');
    document.getElementById('trade-send').disabled = false;
  });

  document.getElementById('trade-send').onclick = async () => {
    if (!selected) return;
    try {
      await API.post('/trades', { offeredAssetId: selected, requestedAssetId: target.id });
      close(); toast('Предложение обмена отправлено!', 'ok'); location.hash = '#/trades';
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* Модальное окно: оставить отзыв */
function openReviewModal(targetUserId, starsHTML) {
  let selectedRating = 0;
  const close = openModal(`
    <h2>Оставить отзыв</h2>
    <p class="sub">Оцените продавца и оставьте комментарий.</p>
    <div class="star-picker" id="star-picker">
      ${[1,2,3,4,5].map(i => `<button class="star-pick" data-r="${i}">★</button>`).join('')}
    </div>
    <div class="form-row" style="margin-top:.8rem"><label>Комментарий (необязательно)</label><textarea id="rv-text" rows="3" maxlength="500" placeholder="Всё прошло отлично…"></textarea></div>
    <button class="btn btn-primary btn-block" id="rv-submit" disabled>Отправить отзыв</button>
  `);
  const stars = document.querySelectorAll('.star-pick');
  const submit = document.getElementById('rv-submit');
  stars.forEach(s => {
    s.onmouseenter = () => stars.forEach((x, i) => x.classList.toggle('hovered', i < Number(s.dataset.r)));
    s.onmouseleave = () => stars.forEach(x => x.classList.remove('hovered'));
    s.onclick = () => {
      selectedRating = Number(s.dataset.r);
      stars.forEach((x, i) => x.classList.toggle('active', i < selectedRating));
      submit.disabled = false;
    };
  });
  submit.onclick = async () => {
    if (!selectedRating) return;
    submit.disabled = true;
    try {
      await API.post('/users/' + targetUserId + '/review', { rating: selectedRating, text: document.getElementById('rv-text').value });
      toast('Отзыв отправлен!', 'ok');
      close();
      viewProfile(targetUserId);
    } catch (e) { toast(e.message, 'err'); submit.disabled = false; }
  };
}

/* ──────────────────────────────────────────────────────────────
   17. ВИД: ЧАТЫ
   ────────────────────────────────────────────────────────────── */

async function viewChats(partnerId) {
  if (!requireAuth()) { app().innerHTML = guestPrompt('Войдите, чтобы использовать чат'); bindGuest(); return; }

  if (partnerId) {
    // Open specific chat
    const { messages, partner } = await API.get('/chats/' + partnerId);
    renderTopbar(); // refresh badge

    app().innerHTML = `<section class="section-pad"><div class="container" style="max-width:700px">
      <div class="chat-header">
        <button class="btn btn-outline btn-sm" id="back-chats">${I.back} Все чаты</button>
        <div style="display:flex;align-items:center;gap:.7rem">
          ${avatarEl(partner.avatarSeed)}
          <div><div style="font-weight:700">${esc(partner.username)}</div><a href="#/u/${partner.id}" style="font-size:.78rem;color:var(--text-3)">Профиль</a></div>
        </div>
      </div>
      <div class="chat-messages" id="chat-msgs">
        ${messages.length ? messages.map(m => `
          <div class="chat-msg ${m.fromId === state.user.id ? 'mine' : 'theirs'}">
            <div class="chat-bubble">${esc(m.text)}</div>
            <div class="chat-time">${timeAgo(m.createdAt)}</div>
          </div>`).join('') : '<div class="chat-empty">Начните диалог! Напишите первое сообщение.</div>'}
      </div>
      <div class="chat-input-row">
        <textarea id="chat-input" placeholder="Написать сообщение…" rows="1" maxlength="2000"></textarea>
        <button class="btn btn-primary" id="chat-send">${I.send}</button>
      </div>
    </div></section>`;

    const msgsEl = document.getElementById('chat-msgs');
    msgsEl.scrollTop = msgsEl.scrollHeight;

    document.getElementById('back-chats').onclick = () => { location.hash = '#/chats'; };

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const doSend = async () => {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        const { message } = await API.post('/chats/' + partnerId, { text });
        input.value = '';
        const div = document.createElement('div');
        div.className = 'chat-msg mine';
        div.innerHTML = `<div class="chat-bubble">${esc(message.text)}</div><div class="chat-time">только что</div>`;
        const empty = msgsEl.querySelector('.chat-empty');
        if (empty) empty.remove();
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      } catch (e) { toast(e.message, 'err'); }
      sendBtn.disabled = false;
      input.focus();
    };
    sendBtn.onclick = doSend;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
    input.focus();
    return;
  }

  // Conversations list
  const { conversations } = await API.get('/chats');
  app().innerHTML = `<section class="section-pad"><div class="container" style="max-width:700px">
    <div class="section-head"><div><span class="eyebrow">Личные сообщения</span><h2>Мои чаты</h2></div></div>
    ${conversations.length ? `<div class="convos-list">${conversations.map(c => `
      <a class="convo-item" href="#/chats/${c.partner.id}">
        ${avatarEl(c.partner.avatarSeed)}
        <div class="convo-info">
          <div class="convo-name">${esc(c.partner.username)}${c.unread > 0 ? `<span class="unread-dot">${c.unread}</span>` : ''}</div>
          <div class="convo-last">${c.lastMessage ? esc(c.lastMessage.text.slice(0, 60)) : '—'}</div>
        </div>
        <div class="convo-time">${c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}</div>
      </a>`).join('')}</div>`
    : emptyBox('Нет сообщений', 'Напишите продавцу со страницы товара.')}
  </div></section>`;

  app().querySelectorAll('[href^="#/chats/"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); location.hash = a.getAttribute('href'); }));
}

/* ──────────────────────────────────────────────────────────────
   18. ВИД: ПОДДЕРЖКА
   ────────────────────────────────────────────────────────────── */

async function viewSupport() {
  if (!requireAuth()) { app().innerHTML = guestPrompt('Войдите, чтобы написать в поддержку'); bindGuest(); return; }

  const { ticket } = await API.get('/support');

  app().innerHTML = `<section class="section-pad"><div class="container" style="max-width:680px">
    <div class="section-head"><div><span class="eyebrow">Служба поддержки</span><h2>Написать администратору</h2>
    <p>Опишите вашу проблему и мы ответим как можно скорее.</p></div></div>
    <div class="support-box">
      <div class="support-msgs" id="support-msgs">
        ${ticket && ticket.messages.length ? ticket.messages.map(m => `
          <div class="support-msg ${m.from === 'user' ? 'user-msg' : 'admin-msg'}">
            <div class="support-bubble">
              ${m.from === 'admin' ? '<span class="admin-label">Поддержка</span>' : ''}
              ${esc(m.text)}
            </div>
            <div class="chat-time">${timeAgo(m.createdAt)}</div>
          </div>`).join('')
        : '<div class="chat-empty">Опишите вашу проблему. Мы стараемся отвечать в течение суток.</div>'}
      </div>
      <div class="chat-input-row">
        <textarea id="support-input" placeholder="Опишите проблему…" rows="2" maxlength="2000"></textarea>
        <button class="btn btn-primary" id="support-send">${I.send}</button>
      </div>
    </div>
  </div></section>`;

  const msgsEl = document.getElementById('support-msgs');
  msgsEl.scrollTop = msgsEl.scrollHeight;

  const input = document.getElementById('support-input');
  const sendBtn = document.getElementById('support-send');
  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      await API.post('/support', { text });
      input.value = '';
      const div = document.createElement('div');
      div.className = 'support-msg user-msg';
      div.innerHTML = `<div class="support-bubble">${esc(text)}</div><div class="chat-time">только что</div>`;
      const empty = msgsEl.querySelector('.chat-empty');
      if (empty) empty.remove();
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      toast('Сообщение отправлено!', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    sendBtn.disabled = false;
    input.focus();
  };
  sendBtn.onclick = doSend;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  input.focus();
}

/* ──────────────────────────────────────────────────────────────
   19. ИНИЦИАЛИЗАЦИЯ
   ────────────────────────────────────────────────────────────── */

async function init() {
  renderFooter();
  try { state.meta = await API.get('/meta'); } catch (_) {}
  if (API.token) refreshMe();
  window.addEventListener('hashchange', router);
  await router();
}

init();
