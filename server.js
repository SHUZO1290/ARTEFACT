/**
 * ARTEFACT — веб-приложение для коллекционирования и обмена цифровыми активами
 * ---------------------------------------------------------------------------
 * Backend: Node.js + Express
 *
 * Возможности:
 *   • Регистрация / авторизация (JWT + bcrypt)
 *   • Кошелёк с балансом внутренней валюты (кредиты)
 *   • Маркетплейс цифровых активов (фильтры, поиск, сортировка)
 *   • Создание ("минт") собственных активов с генеративной обложкой
 *   • Покупка активов за кредиты
 *   • P2P-обмен активами между пользователями (бартерные предложения)
 *   • Лента активности и статистика платформы
 *
 * Хранилище: данные хранятся в памяти и периодически сохраняются в data.json,
 * чтобы они переживали перезапуск при локальной разработке. Для продакшена
 * этот слой легко заменяется на полноценную БД (PostgreSQL, MongoDB и т.п.).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'artefact-dev-secret-change-me';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: memory storage, max 100MB, only png/jpeg
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('Только PNG и JPEG файлы разрешены'));
  },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ────────────────────────────────────────────────────────────────────────
 *  СПРАВОЧНИКИ
 * ──────────────────────────────────────────────────────────────────────── */

const CATEGORIES = ['Искусство', 'Фотография', 'Музыка', 'Игры', '3D', 'Коллекции'];
const RARITIES = ['Обычный', 'Редкий', 'Эпический', 'Легендарный'];
// Веса выпадения редкости при создании актива (чем реже — тем меньше шанс)
const RARITY_WEIGHTS = { 'Обычный': 58, 'Редкий': 27, 'Эпический': 12, 'Легендарный': 3 };

/* ────────────────────────────────────────────────────────────────────────
 *  ХРАНИЛИЩЕ
 * ──────────────────────────────────────────────────────────────────────── */

let db = {
  users: [],
  assets: [],
  trades: [],
  activity: [],
  follows: [],
  reviews: [],
  messages: [],   // { id, fromId, toId, text, createdAt, read }
  supportTickets: [], // { id, userId, messages: [{from,text,createdAt}], status, createdAt }
};

const newId = () => crypto.randomBytes(8).toString('hex');

let saveTimer = null;
function saveDb() {
  // Дебаунс записи, чтобы не дёргать диск на каждый запрос
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error('Не удалось сохранить data.json:', err.message);
    }
  }, 400);
}

function loadDb() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (raw && Array.isArray(raw.users) && raw.users.length) {
        db = raw;
        if (!db.follows) db.follows = [];
        if (!db.reviews) db.reviews = [];
        if (!db.messages) db.messages = [];
        if (!db.supportTickets) db.supportTickets = [];
        // Ensure admin account always exists
        const adminExists = db.users.some((u) => u.username === 'admin');
        if (!adminExists) {
          db.users.unshift({
            id: newId(), username: 'admin', email: 'admin@artefact.io',
            passwordHash: bcrypt.hashSync('Admin2024!', 10),
            balance: 999999, avatarSeed: 99, bio: 'Администратор платформы ARTEFACT.',
            isAdmin: true, createdAt: Date.now(),
          });
        } else {
          // Ensure isAdmin flag is set
          const adm = db.users.find((u) => u.username === 'admin');
          if (adm) adm.isAdmin = true;
        }
        console.log(`Загружено из data.json: ${db.users.length} польз., ${db.assets.length} активов`);
        saveDb();
        return;
      }
    }
  } catch (err) {
    console.error('data.json повреждён, пересоздаю демо-данные:', err.message);
  }
  seedDb();
}

/* ────────────────────────────────────────────────────────────────────────
 *  ДЕМО-ДАННЫЕ
 * ──────────────────────────────────────────────────────────────────────── */

function seedDb() {
  console.log('Инициализация демо-данных…');
  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const adminUser = { id: newId(), username: 'admin', email: 'admin@artefact.io', passwordHash: hash('Admin2024!'), balance: 999999, avatarSeed: 99, bio: 'Администратор платформы ARTEFACT.', isAdmin: true, createdAt: Date.now() };
  const curator = { id: newId(), username: 'curator', email: 'curator@artefact.io', passwordHash: hash('demo1234'), balance: 5200, avatarSeed: 7, bio: 'Куратор галереи цифрового искусства.', createdAt: Date.now() };
  const nova    = { id: newId(), username: 'nova',    email: 'nova@artefact.io',    passwordHash: hash('demo1234'), balance: 3100, avatarSeed: 22, bio: 'Генеративный художник и саунд-дизайнер.', createdAt: Date.now() };
  const pixel   = { id: newId(), username: 'pixel',   email: 'pixel@artefact.io',   passwordHash: hash('demo1234'), balance: 4400, avatarSeed: 41, bio: 'Коллекционер пиксель-арта и ретро-игр.', createdAt: Date.now() };
  db.users = [adminUser, curator, nova, pixel];

  const seedAssets = [
    ['Рассвет нулей',          'Искусство',  'Эпический',    curator, 240,  101, true ],
    ['Лунный протокол',        '3D',         'Легендарный',  curator, 980,  102, true ],
    ['Тихий шум №7',           'Фотография', 'Редкий',       curator, 130,  103, true ],
    ['Сад фракталов',          'Искусство',  'Эпический',    curator, 310,  104, true ],
    ['Орбита памяти',          '3D',         'Редкий',       curator, 160,  105, false],
    ['Сигнал из пустоты',      'Музыка',     'Легендарный',  nova,    760,  106, true ],
    ['Глитч на закате',        'Искусство',  'Редкий',       nova,    150,  107, true ],
    ['Волны эфира',            'Музыка',     'Эпический',    nova,    280,  108, true ],
    ['Северное сияние v2',     'Фотография', 'Эпический',    nova,    300,  109, true ],
    ['Шёпот машин',            'Музыка',     'Обычный',      nova,     45,  110, true ],
    ['Кристалл данных',        '3D',         'Эпический',    nova,    260,  111, false],
    ['Пиксельный странник',    'Игры',       'Легендарный',  pixel,   820,  112, true ],
    ['8-битный дракон',        'Игры',       'Эпический',    pixel,   270,  113, true ],
    ['Карта забытых уровней',  'Коллекции',  'Редкий',       pixel,   140,  114, true ],
    ['Неоновый перекрёсток',   'Фотография', 'Обычный',      pixel,     50, 115, true ],
    ['Артефакт первопроходца', 'Коллекции',  'Легендарный',  pixel,   910,  116, true ],
    ['Спрайт-герой',           'Игры',       'Обычный',      pixel,     40, 117, true ],
    ['Геометрия тишины',       'Искусство',  'Редкий',       curator, 170,  118, true ],
    ['Поток сознания',         'Музыка',     'Редкий',       nova,    155,  119, false],
    ['Монолит',                '3D',         'Легендарный',  curator, 870,  120, true ],
  ];

  db.assets = seedAssets.map(([name, category, rarity, owner, price, artSeed, forSale]) => ({
    id: newId(),
    name,
    description: descriptionFor(name, category),
    category,
    rarity,
    artSeed,
    creatorId: owner.id,
    ownerId: owner.id,
    price,
    forSale,
    likes: [],
    createdAt: Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30),
  }));

  db.trades = [];
  db.follows = [];
  db.reviews = [];
  db.messages = [];
  db.supportTickets = [];
  db.activity = db.assets.slice(0, 6).map((a, i) => ({
    id: newId(),
    type: 'mint',
    text: `создал актив «${a.name}»`,
    userId: a.creatorId,
    assetId: a.id,
    createdAt: Date.now() - i * 1000 * 60 * 37,
  }));

  saveDb();
}

function descriptionFor(name, category) {
  const map = {
    'Искусство': 'Уникальное генеративное произведение цифрового искусства. Каждая линия рассчитана алгоритмом и существует в единственном экземпляре.',
    'Фотография': 'Цифровой кадр, запечатлевший мимолётное состояние света и формы. Лимитированный выпуск.',
    'Музыка': 'Аудиовизуальный актив: звуковой ландшафт, преобразованный в визуальную партитуру.',
    'Игры': 'Внутриигровой коллекционный предмет с подтверждённой подлинностью и историей владения.',
    '3D': 'Объёмный цифровой объект, готовый к использованию в виртуальных пространствах и метавселенных.',
    'Коллекции': 'Редкий предмет из тематической коллекции. Подлинность и происхождение зафиксированы в реестре.',
  };
  return `«${name}». ${map[category] || 'Цифровой актив с уникальной обложкой.'}`;
}

/* ────────────────────────────────────────────────────────────────────────
 *  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 * ──────────────────────────────────────────────────────────────────────── */

const findUser = (id) => db.users.find((u) => u.id === id);
const findAsset = (id) => db.assets.find((a) => a.id === id);

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, balance: u.balance, avatarSeed: u.avatarSeed, bio: u.bio || '', isAdmin: u.isAdmin || false, createdAt: u.createdAt };
}

function userRatingInfo(userId) {
  const reviews = db.reviews.filter((r) => r.targetUserId === userId);
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  return { rating: avg, reviewCount: count };
}

function assetView(a, viewerId) {
  const creator = findUser(a.creatorId);
  const owner = findUser(a.ownerId);
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    category: a.category,
    rarity: a.rarity,
    artSeed: a.artSeed,
    imageUrl: a.imageUrl || null,
    price: a.price,
    forSale: a.forSale,
    createdAt: a.createdAt,
    likeCount: a.likes.length,
    likedByMe: viewerId ? a.likes.includes(viewerId) : false,
    creator: creator ? { id: creator.id, username: creator.username, avatarSeed: creator.avatarSeed } : null,
    owner: owner ? { id: owner.id, username: owner.username, avatarSeed: owner.avatarSeed } : null,
  };
}

function logActivity(type, text, userId, assetId) {
  db.activity.unshift({ id: newId(), type, text, userId, assetId, createdAt: Date.now() });
  if (db.activity.length > 200) db.activity.length = 200;
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

// Middleware: обязательная авторизация
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUser(payload.uid);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// Middleware: необязательная авторизация (для лайков/просмотра)
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = findUser(payload.uid) || null;
    } catch (_) { /* игнорируем */ }
  }
  next();
}

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: АВТОРИЗАЦИЯ
 * ──────────────────────────────────────────────────────────────────────── */

app.post('/api/register', (req, res) => {
  let { username, email, password } = req.body || {};
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();

  if (username.length < 3) return res.status(400).json({ error: 'Имя пользователя — минимум 3 символа' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Некорректный e-mail' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'E-mail уже зарегистрирован' });
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Имя уже занято' });

  const user = {
    id: newId(),
    username,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    balance: 0,
    avatarSeed: Math.floor(Math.random() * 1000),
    bio: '',
    createdAt: Date.now(),
  };
  db.users.push(user);
  logActivity('join', 'присоединился к ARTEFACT', user.id, null);
  saveDb();
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  let { login, password } = req.body || {};
  login = (login || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === login || u.username.toLowerCase() === login);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Вход как гость — создаём временный аккаунт
app.post('/api/guest-login', (req, res) => {
  const num = Math.floor(Math.random() * 9000) + 1000;
  const username = `Гость_${num}`;
  const user = {
    id: newId(),
    username,
    email: `guest_${num}_${Date.now()}@guest.local`,
    passwordHash: '',
    balance: 0,
    avatarSeed: Math.floor(Math.random() * 1000),
    bio: 'Гостевой аккаунт',
    isGuest: true,
    createdAt: Date.now(),
  };
  db.users.push(user);
  saveDb();
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Upload image for asset cover
app.post('/api/upload-image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const filename = `asset_${req.user.id}_${Date.now()}.jpg`;
    const outPath = path.join(UPLOADS_DIR, filename);
    await sharp(req.file.buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(outPath);
    res.json({ url: '/uploads/' + filename });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ошибка загрузки' });
  }
});

// Follow / unfollow user
app.post('/api/users/:id/follow', auth, (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя подписаться на себя' });
  if (!findUser(targetId)) return res.status(404).json({ error: 'Пользователь не найден' });
  const existing = db.follows.findIndex((f) => f.followerId === req.user.id && f.followingId === targetId);
  if (existing !== -1) {
    db.follows.splice(existing, 1);
    saveDb();
    return res.json({ following: false, followersCount: db.follows.filter((f) => f.followingId === targetId).length });
  }
  db.follows.push({ followerId: req.user.id, followingId: targetId });
  saveDb();
  res.json({ following: true, followersCount: db.follows.filter((f) => f.followingId === targetId).length });
});

// Post a review for a user — only allowed if buyer purchased from seller
app.post('/api/users/:id/review', auth, (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя оставить отзыв себе' });
  if (!findUser(targetId)) return res.status(404).json({ error: 'Пользователь не найден' });

  // Check: did current user buy something from target user?
  const hasPurchased = db.activity.some(
    (e) => e.type === 'buy' && e.userId === req.user.id && (() => {
      const a = findAsset(e.assetId);
      return a && a.creatorId === targetId;
    })()
  ) || db.assets.some(
    (a) => a.ownerId === req.user.id && a.creatorId === targetId && a.creatorId !== a.ownerId
  );
  // Also allow if they completed a trade
  const hasTraded = db.trades.some(
    (t) => t.status === 'accepted' && (
      (t.fromUserId === req.user.id && t.toUserId === targetId) ||
      (t.toUserId === req.user.id && t.fromUserId === targetId)
    )
  );
  if (!hasPurchased && !hasTraded) {
    return res.status(403).json({ error: 'Оставить отзыв можно только после покупки товара у этого продавца' });
  }

  const { rating, text } = req.body || {};
  const r = Math.round(Number(rating));
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });
  const existIdx = db.reviews.findIndex((rv) => rv.authorId === req.user.id && rv.targetUserId === targetId);
  const review = { id: newId(), authorId: req.user.id, targetUserId: targetId, rating: r, text: (text || '').trim().slice(0, 500), createdAt: Date.now() };
  if (existIdx !== -1) db.reviews[existIdx] = review;
  else db.reviews.push(review);
  saveDb();
  res.json({ ok: true, ...userRatingInfo(targetId) });
});

// Check if current user can leave a review for target
app.get('/api/users/:id/can-review', auth, (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.json({ canReview: false, reason: 'self' });
  const hasPurchased = db.assets.some(
    (a) => a.ownerId === req.user.id && a.creatorId === targetId && a.creatorId !== a.ownerId
  ) || db.activity.some(
    (e) => e.type === 'buy' && e.userId === req.user.id && (() => { const a = findAsset(e.assetId); return a && a.creatorId === targetId; })()
  );
  const hasTraded = db.trades.some(
    (t) => t.status === 'accepted' && (
      (t.fromUserId === req.user.id && t.toUserId === targetId) ||
      (t.toUserId === req.user.id && t.fromUserId === targetId)
    )
  );
  const alreadyReviewed = db.reviews.some((rv) => rv.authorId === req.user.id && rv.targetUserId === targetId);
  res.json({ canReview: (hasPurchased || hasTraded) && !alreadyReviewed, alreadyReviewed });
});

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: ЧАТЫ
 * ──────────────────────────────────────────────────────────────────────── */

// Get all conversations for current user
app.get('/api/chats', auth, (req, res) => {
  const uid = req.user.id;
  const partnerIds = [...new Set(
    db.messages
      .filter((m) => m.fromId === uid || m.toId === uid)
      .map((m) => m.fromId === uid ? m.toId : m.fromId)
  )];
  const convos = partnerIds.map((pid) => {
    const partner = findUser(pid);
    if (!partner) return null;
    const msgs = db.messages
      .filter((m) => (m.fromId === uid && m.toId === pid) || (m.fromId === pid && m.toId === uid))
      .sort((a, b) => b.createdAt - a.createdAt);
    const last = msgs[0];
    const unread = msgs.filter((m) => m.toId === uid && !m.read).length;
    return { partner: publicUser(partner), lastMessage: last || null, unread };
  }).filter(Boolean).sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
  res.json({ conversations: convos });
});

// Get messages between current user and partner
app.get('/api/chats/:partnerId', auth, (req, res) => {
  const uid = req.user.id;
  const pid = req.params.partnerId;
  if (!findUser(pid)) return res.status(404).json({ error: 'Пользователь не найден' });
  const msgs = db.messages
    .filter((m) => (m.fromId === uid && m.toId === pid) || (m.fromId === pid && m.toId === uid))
    .sort((a, b) => a.createdAt - b.createdAt);
  // Mark as read
  msgs.forEach((m) => { if (m.toId === uid) m.read = true; });
  saveDb();
  res.json({ messages: msgs, partner: publicUser(findUser(pid)) });
});

// Send a message
app.post('/api/chats/:partnerId', auth, (req, res) => {
  const uid = req.user.id;
  const pid = req.params.partnerId;
  if (!findUser(pid)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (uid === pid) return res.status(400).json({ error: 'Нельзя писать себе' });
  const text = (req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  const msg = { id: newId(), fromId: uid, toId: pid, text, createdAt: Date.now(), read: false };
  db.messages.push(msg);
  saveDb();
  res.json({ message: msg });
});

// Unread count
app.get('/api/chats-unread', auth, (req, res) => {
  const count = db.messages.filter((m) => m.toId === req.user.id && !m.read).length;
  res.json({ unread: count });
});

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: ПОДДЕРЖКА
 * ──────────────────────────────────────────────────────────────────────── */

// Create or get support ticket for current user
app.get('/api/support', auth, (req, res) => {
  let ticket = db.supportTickets.find((t) => t.userId === req.user.id && t.status !== 'closed');
  if (!ticket) return res.json({ ticket: null });
  res.json({ ticket });
});

app.post('/api/support', auth, (req, res) => {
  const text = (req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  let ticket = db.supportTickets.find((t) => t.userId === req.user.id && t.status !== 'closed');
  if (!ticket) {
    ticket = { id: newId(), userId: req.user.id, messages: [], status: 'open', createdAt: Date.now() };
    db.supportTickets.push(ticket);
  }
  ticket.messages.push({ from: 'user', fromId: req.user.id, text, createdAt: Date.now() });
  ticket.updatedAt = Date.now();
  saveDb();
  res.json({ ticket });
});

// Admin: get all tickets (simple: any user named 'admin' or first user)
app.get('/api/support/admin', auth, (req, res) => {
  const isAdmin = req.user.isAdmin || req.user.username === 'admin';
  if (!isAdmin) return res.status(403).json({ error: 'Нет доступа' });
  const tickets = db.supportTickets.map((t) => ({ ...t, user: publicUser(findUser(t.userId)) }));
  res.json({ tickets });
});

app.post('/api/support/:ticketId/reply', auth, (req, res) => {
  const isAdmin = req.user.isAdmin || req.user.username === 'admin';
  if (!isAdmin) return res.status(403).json({ error: 'Нет доступа' });
  const ticket = db.supportTickets.find((t) => t.id === req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  const text = (req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  ticket.messages.push({ from: 'admin', text, createdAt: Date.now() });
  ticket.updatedAt = Date.now();
  saveDb();
  res.json({ ticket });
});

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: АКТИВЫ
 * ──────────────────────────────────────────────────────────────────────── */

app.get('/api/meta', (_req, res) => {
  res.json({ categories: CATEGORIES, rarities: RARITIES });
});

app.get('/api/assets', optionalAuth, (req, res) => {
  const { category, rarity, search, sort, forSale } = req.query;
  let list = db.assets.slice();

  if (category && category !== 'Все') list = list.filter((a) => a.category === category);
  if (rarity && rarity !== 'Все') list = list.filter((a) => a.rarity === rarity);
  if (forSale === 'true') list = list.filter((a) => a.forSale);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }

  switch (sort) {
    case 'price_asc': list.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
    case 'price_desc': list.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
    case 'popular': list.sort((a, b) => b.likes.length - a.likes.length); break;
    case 'oldest': list.sort((a, b) => a.createdAt - b.createdAt); break;
    default: list.sort((a, b) => b.createdAt - a.createdAt); // newest
  }

  const viewerId = req.user ? req.user.id : null;
  res.json({ assets: list.map((a) => assetView(a, viewerId)) });
});

app.get('/api/assets/:id', optionalAuth, (req, res) => {
  const a = findAsset(req.params.id);
  if (!a) return res.status(404).json({ error: 'Актив не найден' });
  const viewerId = req.user ? req.user.id : null;
  // История последних событий по активу
  const history = db.activity.filter((e) => e.assetId === a.id).slice(0, 12).map((e) => ({
    ...e,
    username: (findUser(e.userId) || {}).username || 'неизвестно',
  }));
  res.json({ asset: assetView(a, viewerId), history });
});

// Создание ("минт") нового актива
app.post('/api/assets', auth, (req, res) => {
  let { name, description, category, imageUrl } = req.body || {};
  name = (name || '').trim();
  description = (description || '').trim();

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Название: от 2 до 60 символов' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Неизвестная категория' });

  const rarity = rollRarity();
  const reqSeed = Number(req.body && req.body.artSeed);
  const artSeed = Number.isInteger(reqSeed) && reqSeed >= 0 && reqSeed <= 100_000_000 ? reqSeed : Math.floor(Math.random() * 1_000_000);
  // Validate imageUrl if provided (must be our own upload)
  const safeImageUrl = (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('/uploads/')) ? imageUrl : null;
  const asset = {
    id: newId(),
    name,
    description: description || descriptionFor(name, category),
    category,
    rarity,
    artSeed,
    imageUrl: safeImageUrl,
    creatorId: req.user.id,
    ownerId: req.user.id,
    price: 0,
    forSale: false,
    likes: [],
    createdAt: Date.now(),
  };
  db.assets.push(asset);
  logActivity('mint', `создал актив «${asset.name}» (${rarity})`, req.user.id, asset.id);
  saveDb();
  res.json({ asset: assetView(asset, req.user.id) });
});

function rollRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of Object.entries(RARITY_WEIGHTS)) {
    if ((r -= w) <= 0) return name;
  }
  return 'Обычный';
}

// Выставить на продажу
app.post('/api/assets/:id/list', auth, (req, res) => {
  const a = findAsset(req.params.id);
  if (!a) return res.status(404).json({ error: 'Актив не найден' });
  if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
  const price = Math.round(Number(req.body && req.body.price));
  if (!Number.isFinite(price) || price < 1 || price > 1_000_000) return res.status(400).json({ error: 'Укажите цену от 1 до 1 000 000' });
  a.forSale = true;
  a.price = price;
  logActivity('list', `выставил «${a.name}» за ${price} ◈`, req.user.id, a.id);
  saveDb();
  res.json({ asset: assetView(a, req.user.id) });
});

// Снять с продажи
app.post('/api/assets/:id/unlist', auth, (req, res) => {
  const a = findAsset(req.params.id);
  if (!a) return res.status(404).json({ error: 'Актив не найден' });
  if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
  a.forSale = false;
  saveDb();
  res.json({ asset: assetView(a, req.user.id) });
});

// Удаление актива
app.post('/api/assets/:id/delete', auth, (req, res) => {
  const idx = db.assets.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Актив не найден' });
  const a = db.assets[idx];
  if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
  cancelTradesInvolving(a.id, 'актив удалён');
  db.assets.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// Покупка
app.post('/api/assets/:id/buy', auth, (req, res) => {
  const a = findAsset(req.params.id);
  if (!a) return res.status(404).json({ error: 'Актив не найден' });
  if (!a.forSale) return res.status(400).json({ error: 'Актив не продаётся' });
  if (a.ownerId === req.user.id) return res.status(400).json({ error: 'Это уже ваш актив' });
  const seller = findUser(a.ownerId);
  const buyer = req.user;
  if (buyer.balance < a.price) return res.status(400).json({ error: 'Недостаточно кредитов' });

  buyer.balance -= a.price;
  if (seller) seller.balance += a.price;
  const paid = a.price;
  a.ownerId = buyer.id;
  a.forSale = false;

  // Закрываем встречные обмены, где этот актив участвовал
  cancelTradesInvolving(a.id, 'актив сменил владельца');

  logActivity('buy', `купил «${a.name}» за ${paid} ◈`, buyer.id, a.id);
  saveDb();
  res.json({ asset: assetView(a, buyer.id), balance: buyer.balance });
});

// Лайк / снятие лайка
app.post('/api/assets/:id/like', auth, (req, res) => {
  const a = findAsset(req.params.id);
  if (!a) return res.status(404).json({ error: 'Актив не найден' });
  const i = a.likes.indexOf(req.user.id);
  if (i === -1) a.likes.push(req.user.id);
  else a.likes.splice(i, 1);
  saveDb();
  res.json({ likeCount: a.likes.length, likedByMe: i === -1 });
});

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: КОЛЛЕКЦИИ И ПОЛЬЗОВАТЕЛИ
 * ──────────────────────────────────────────────────────────────────────── */

app.get('/api/users/:id', optionalAuth, (req, res) => {
  const u = findUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
  const viewerId = req.user ? req.user.id : null;
  const owned = db.assets.filter((a) => a.ownerId === u.id);
  const created = db.assets.filter((a) => a.creatorId === u.id);
  const followersCount = db.follows.filter((f) => f.followingId === u.id).length;
  const followingCount = db.follows.filter((f) => f.followerId === u.id).length;
  const isFollowing = viewerId ? db.follows.some((f) => f.followerId === viewerId && f.followingId === u.id) : false;
  const ri = userRatingInfo(u.id);
  const reviews = db.reviews
    .filter((r) => r.targetUserId === u.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((r) => ({ ...r, authorUsername: (findUser(r.authorId) || {}).username || 'аноним', authorAvatarSeed: (findUser(r.authorId) || {}).avatarSeed ?? 0 }));
  res.json({
    user: publicUser(u),
    stats: {
      owned: owned.length,
      created: created.length,
      collectionValue: owned.reduce((s, a) => s + (a.price || estimateValue(a)), 0),
      followersCount,
      followingCount,
    },
    isFollowing,
    rating: ri.rating,
    reviewCount: ri.reviewCount,
    reviews,
    owned: owned.map((a) => assetView(a, viewerId)),
  });
});

// Лидерборд коллекционеров
app.get('/api/leaderboard', (_req, res) => {
  const board = db.users.map((u) => {
    const owned = db.assets.filter((a) => a.ownerId === u.id);
    return {
      user: publicUser(u),
      count: owned.length,
      value: owned.reduce((s, a) => s + (a.price || estimateValue(a)), 0),
      legendary: owned.filter((a) => a.rarity === 'Легендарный').length,
    };
  }).sort((a, b) => b.value - a.value);
  res.json({ leaderboard: board });
});

function estimateValue(a) {
  const base = { 'Обычный': 40, 'Редкий': 150, 'Эпический': 300, 'Легендарный': 850 };
  return base[a.rarity] || 50;
}

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: ОБМЕН (P2P-бартер)
 * ──────────────────────────────────────────────────────────────────────── */

// Создать предложение обмена: я отдаю offeredAssetId за requestedAssetId
app.post('/api/trades', auth, (req, res) => {
  const { offeredAssetId, requestedAssetId } = req.body || {};
  const offered = findAsset(offeredAssetId);
  const requested = findAsset(requestedAssetId);
  if (!offered || !requested) return res.status(404).json({ error: 'Актив не найден' });
  if (offered.id === requested.id) return res.status(400).json({ error: 'Нельзя обменять актив сам на себя' });
  if (offered.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владеете предлагаемым активом' });
  if (requested.ownerId === req.user.id) return res.status(400).json({ error: 'Запрашиваемый актив уже ваш' });

  const exists = db.trades.some((t) => t.status === 'open' && t.offeredAssetId === offered.id && t.requestedAssetId === requested.id && t.fromUserId === req.user.id);
  if (exists) return res.status(409).json({ error: 'Такое предложение уже отправлено' });

  const trade = {
    id: newId(),
    fromUserId: req.user.id,
    toUserId: requested.ownerId,
    offeredAssetId: offered.id,
    requestedAssetId: requested.id,
    status: 'open',
    createdAt: Date.now(),
  };
  db.trades.push(trade);
  logActivity('trade_offer', `предложил обмен: «${offered.name}» ⇄ «${requested.name}»`, req.user.id, requested.id);
  saveDb();
  res.json({ trade: tradeView(trade) });
});

// Мои обмены: входящие и исходящие
app.get('/api/trades', auth, (req, res) => {
  const mine = db.trades.filter((t) => t.fromUserId === req.user.id || t.toUserId === req.user.id);
  mine.sort((a, b) => b.createdAt - a.createdAt);
  res.json({
    incoming: mine.filter((t) => t.toUserId === req.user.id).map(tradeView),
    outgoing: mine.filter((t) => t.fromUserId === req.user.id).map(tradeView),
  });
});

// Принять обмен (только получатель)
app.post('/api/trades/:id/accept', auth, (req, res) => {
  const t = db.trades.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Предложение не найдено' });
  if (t.status !== 'open') return res.status(400).json({ error: 'Предложение уже закрыто' });
  if (t.toUserId !== req.user.id) return res.status(403).json({ error: 'Нельзя принять чужое предложение' });

  const offered = findAsset(t.offeredAssetId);
  const requested = findAsset(t.requestedAssetId);
  if (!offered || !requested) { t.status = 'cancelled'; saveDb(); return res.status(400).json({ error: 'Один из активов недоступен' }); }
  if (offered.ownerId !== t.fromUserId || requested.ownerId !== t.toUserId) {
    t.status = 'cancelled'; saveDb();
    return res.status(400).json({ error: 'Состав владельцев изменился, обмен отменён' });
  }

  // Меняем владельцев местами
  offered.ownerId = t.toUserId;
  requested.ownerId = t.fromUserId;
  offered.forSale = false;
  requested.forSale = false;
  t.status = 'accepted';

  // Отменяем прочие открытые обмены с этими активами
  cancelTradesInvolving(offered.id, 'актив участвовал в другом обмене', t.id);
  cancelTradesInvolving(requested.id, 'актив участвовал в другом обмене', t.id);

  logActivity('trade_done', `обменялся: «${offered.name}» ⇄ «${requested.name}»`, req.user.id, requested.id);
  saveDb();
  res.json({ trade: tradeView(t) });
});

// Отклонить / отменить обмен (любая из сторон)
app.post('/api/trades/:id/decline', auth, (req, res) => {
  const t = db.trades.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Предложение не найдено' });
  if (t.status !== 'open') return res.status(400).json({ error: 'Предложение уже закрыто' });
  if (t.fromUserId !== req.user.id && t.toUserId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  t.status = t.fromUserId === req.user.id ? 'cancelled' : 'declined';
  saveDb();
  res.json({ trade: tradeView(t) });
});

function cancelTradesInvolving(assetId, reason, exceptId) {
  for (const t of db.trades) {
    if (t.status === 'open' && t.id !== exceptId && (t.offeredAssetId === assetId || t.requestedAssetId === assetId)) {
      t.status = 'cancelled';
      t.cancelReason = reason;
    }
  }
}

function tradeView(t) {
  const offered = findAsset(t.offeredAssetId);
  const requested = findAsset(t.requestedAssetId);
  const from = findUser(t.fromUserId);
  const to = findUser(t.toUserId);
  return {
    id: t.id,
    status: t.status,
    createdAt: t.createdAt,
    from: from ? { id: from.id, username: from.username, avatarSeed: from.avatarSeed } : null,
    to: to ? { id: to.id, username: to.username, avatarSeed: to.avatarSeed } : null,
    offered: offered ? assetView(offered) : null,
    requested: requested ? assetView(requested) : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: АКТИВНОСТЬ И СТАТИСТИКА
 * ──────────────────────────────────────────────────────────────────────── */

app.get('/api/activity', (_req, res) => {
  const items = db.activity.slice(0, 25).map((e) => ({
    ...e,
    username: (findUser(e.userId) || {}).username || 'система',
    avatarSeed: (findUser(e.userId) || {}).avatarSeed ?? 0,
    asset: e.assetId ? (() => { const a = findAsset(e.assetId); return a ? { id: a.id, name: a.name, artSeed: a.artSeed, rarity: a.rarity } : null; })() : null,
  }));
  res.json({ activity: items });
});

app.get('/api/stats', (_req, res) => {
  const volume = db.activity.filter((e) => e.type === 'buy').length;
  res.json({
    users: db.users.length,
    assets: db.assets.length,
    forSale: db.assets.filter((a) => a.forSale).length,
    trades: db.trades.filter((t) => t.status === 'accepted').length,
    sales: volume,
  });
});

// Close a ticket (admin only)
app.post('/api/support/:ticketId/close', auth, (req, res) => {
  const isAdmin = req.user.isAdmin || req.user.username === 'admin';
  if (!isAdmin) return res.status(403).json({ error: 'Нет доступа' });
  const ticket = db.supportTickets.find((t) => t.id === req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  ticket.status = 'closed';
  ticket.updatedAt = Date.now();
  saveDb();
  res.json({ ticket });
});

/* ────────────────────────────────────────────────────────────────────────
 *  МАРШРУТЫ: КОШЕЛЁК (пополнение / вывод / перевод)
 *  Курс: 1 токен = 1 рубль (бета-режим для презентации)
 * ──────────────────────────────────────────────────────────────────────── */

// Пополнение баланса
app.post('/api/wallet/deposit', auth, (req, res) => {
  const { amount, method } = req.body || {};
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1 || n > 1_000_000) return res.status(400).json({ error: 'Укажите сумму от 1 до 1 000 000' });
  const allowed = ['card', 'qr', 'phone'];
  if (!allowed.includes(method)) return res.status(400).json({ error: 'Неизвестный метод' });
  req.user.balance += n;
  logActivity('deposit', `пополнил баланс на ${n} ◈`, req.user.id, null);
  saveDb();
  res.json({ balance: req.user.balance, credited: n });
});

// Вывод средств
app.post('/api/wallet/withdraw', auth, (req, res) => {
  const { amount, method } = req.body || {};
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Укажите сумму от 1' });
  if (n > req.user.balance) return res.status(400).json({ error: 'Недостаточно средств на балансе' });
  const allowed = ['card_rf', 'crypto', 'ptp'];
  if (!allowed.includes(method)) return res.status(400).json({ error: 'Неизвестный метод' });
  req.user.balance -= n;
  logActivity('withdraw', `вывел ${n} ◈`, req.user.id, null);
  saveDb();
  res.json({ balance: req.user.balance, withdrawn: n });
});

// Перевод другому пользователю
app.post('/api/wallet/transfer', auth, (req, res) => {
  const { toUsername, amount } = req.body || {};
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Укажите сумму от 1' });
  if (n > req.user.balance) return res.status(400).json({ error: 'Недостаточно средств на балансе' });
  const recipient = db.users.find((u) => u.username.toLowerCase() === (toUsername || '').trim().toLowerCase());
  if (!recipient) return res.status(404).json({ error: 'Пользователь не найден' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'Нельзя переводить себе' });
  req.user.balance -= n;
  recipient.balance += n;
  logActivity('transfer', `перевёл ${n} ◈ → ${recipient.username}`, req.user.id, null);
  saveDb();
  res.json({ balance: req.user.balance, transferred: n, to: recipient.username });
});

/* ────────────────────────────────────────────────────────────────────────
 *  SPA fallback + запуск
 * ──────────────────────────────────────────────────────────────────────── */

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

loadDb();
app.listen(PORT, () => {
  console.log(`\n  ARTEFACT запущен → http://localhost:${PORT}\n`);
});
