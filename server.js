/**
 * ARTEFACT — сервер (Node.js + Express + MySQL)
 * Данные хранятся в MySQL.
 * На Railway: добавьте MySQL-сервис и переменную DATABASE_URL = ${{ MySQL.MYSQL_URL }}
 */

'use strict';
const path    = require('path');
const crypto  = require('crypto');
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const mysql   = require('mysql2/promise');
const multer  = require('multer');
const sharp   = require('sharp');

/* ---------- Константы ---------- */
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'artefact-secret-2024';
const CATEGORIES = ['Искусство', 'Фотография', 'Музыка', 'Игры', '3D', 'Коллекции'];
const RARITY_WEIGHTS = { 'Обычный': 50, 'Редкий': 30, 'Эпический': 15, 'Легендарный': 5 };
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const newId = () => crypto.randomBytes(8).toString('hex');

/* ---------- Подключение к MySQL ----------
   Railway: DATABASE_URL = ${{ MySQL.MYSQL_URL }}
   Локально: DB_HOST / DB_USER / DB_PASSWORD / DB_NAME                    */
const pool = mysql.createPool(
  (process.env.DATABASE_URL || process.env.MYSQL_URL)
    ? (process.env.DATABASE_URL || process.env.MYSQL_URL)
    : {
        host:     process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost',
        port:     process.env.DB_PORT     || process.env.MYSQLPORT     || 3306,
        user:     process.env.DB_USER     || process.env.MYSQLUSER     || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
        database: process.env.DB_NAME     || process.env.MYSQLDATABASE || 'artefact',
        waitForConnections: true, connectionLimit: 10,
      }
);

/* ---------- Приложение ---------- */
const app = express();
if (!require('fs').existsSync(UPLOADS_DIR)) require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.set('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
});

/* ---------- Загрузка изображений (остаётся на диске) ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `asset_${newId()}_${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

/* ================================================================
 *  БАЗА ДАННЫХ: создание таблиц и начальные данные
 * ============================================================== */
async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    passwordHash VARCHAR(255),
    balance INT DEFAULT 0,
    avatarSeed INT DEFAULT 0,
    bio TEXT,
    isAdmin TINYINT(1) DEFAULT 0,
    isGuest TINYINT(1) DEFAULT 0,
    createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255), description TEXT,
    category VARCHAR(100), rarity VARCHAR(50),
    artSeed INT, imageUrl VARCHAR(500),
    creatorId VARCHAR(32), ownerId VARCHAR(32),
    price INT DEFAULT 0, forSale TINYINT(1) DEFAULT 0,
    createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS asset_likes (
    assetId VARCHAR(32), userId VARCHAR(32),
    PRIMARY KEY (assetId, userId)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(32) PRIMARY KEY,
    fromUserId VARCHAR(32), toUserId VARCHAR(32),
    offeredAssetId VARCHAR(32), requestedAssetId VARCHAR(32),
    status VARCHAR(20) DEFAULT 'open',
    cancelReason VARCHAR(255), createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS activity (
    id VARCHAR(32) PRIMARY KEY,
    type VARCHAR(50), text TEXT,
    userId VARCHAR(32), assetId VARCHAR(32),
    createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS follows (
    followerId VARCHAR(32), followingId VARCHAR(32),
    PRIMARY KEY (followerId, followingId)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(32) PRIMARY KEY,
    authorId VARCHAR(32), targetUserId VARCHAR(32),
    rating INT, comment TEXT, createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(32) PRIMARY KEY,
    fromId VARCHAR(32), toId VARCHAR(32),
    text TEXT, isRead TINYINT(1) DEFAULT 0, createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(32) PRIMARY KEY,
    userId VARCHAR(32), status VARCHAR(20) DEFAULT 'open',
    createdAt BIGINT, updatedAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS support_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticketId VARCHAR(32), fromRole VARCHAR(20),
    text TEXT, createdAt BIGINT
  ) CHARACTER SET utf8mb4`);

  await seedDb();
}

async function seedDb() {
  const [[uc]] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (uc.c > 0) return; // уже засеяно

  console.log('Инициализация демо-данных…');
  const h = (p) => bcrypt.hashSync(p, 10);
  const now = Date.now();

  const admin   = { id: newId(), username: 'admin',   email: 'admin@artefact.io',   passwordHash: h('Admin2024!'), balance: 999999, avatarSeed: 99, isAdmin: 1, createdAt: now };
  const curator = { id: newId(), username: 'curator', email: 'curator@artefact.io', passwordHash: h('demo1234'),   balance: 5200,   avatarSeed: 7,  createdAt: now - 1000 * 60 };
  const nova    = { id: newId(), username: 'nova',    email: 'nova@artefact.io',    passwordHash: h('demo1234'),   balance: 3100,   avatarSeed: 22, createdAt: now - 2000 * 60 };
  const pixel   = { id: newId(), username: 'pixel',   email: 'pixel@artefact.io',   passwordHash: h('demo1234'),   balance: 4400,   avatarSeed: 41, createdAt: now - 3000 * 60 };
  const users = [admin, curator, nova, pixel];

  for (const u of users) {
    await pool.query(
      'INSERT INTO users (id,username,email,passwordHash,balance,avatarSeed,bio,isAdmin,isGuest,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [u.id, u.username, u.email, u.passwordHash, u.balance, u.avatarSeed, u.bio || '', u.isAdmin || 0, 0, u.createdAt]
    );
  }

  const seedAssets = [
    ['Рассвет нулей','Искусство','Эпический',curator,240,101,true],
    ['Лунный протокол','3D','Легендарный',curator,980,102,true],
    ['Тихий шум №7','Фотография','Редкий',curator,130,103,true],
    ['Сад фракталов','Искусство','Эпический',curator,310,104,true],
    ['Орбита памяти','3D','Редкий',curator,160,105,false],
    ['Сигнал из пустоты','Музыка','Легендарный',nova,760,106,true],
    ['Глитч на закате','Искусство','Редкий',nova,150,107,true],
    ['Волны эфира','Музыка','Эпический',nova,280,108,true],
    ['Северное сияние v2','Фотография','Эпический',nova,300,109,true],
    ['Шёпот машин','Музыка','Обычный',nova,45,110,true],
    ['Кристалл данных','3D','Эпический',nova,260,111,false],
    ['Пиксельный странник','Игры','Легендарный',pixel,820,112,true],
    ['8-битный дракон','Игры','Эпический',pixel,270,113,true],
    ['Карта забытых уровней','Коллекции','Редкий',pixel,140,114,true],
    ['Неоновый перекрёсток','Фотография','Обычный',pixel,50,115,true],
    ['Артефакт первопроходца','Коллекции','Легендарный',pixel,910,116,true],
    ['Спрайт-герой','Игры','Обычный',pixel,40,117,true],
    ['Геометрия тишины','Искусство','Редкий',curator,170,118,true],
    ['Поток сознания','Музыка','Редкий',nova,155,119,false],
    ['Монолит','3D','Легендарный',curator,870,120,true],
  ];

  const ids = [];
  for (const [name, cat, rarity, owner, price, artSeed, forSale] of seedAssets) {
    const id = newId();
    ids.push(id);
    const desc = descriptionFor(name, cat);
    await pool.query(
      'INSERT INTO assets (id,name,description,category,rarity,artSeed,creatorId,ownerId,price,forSale,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id, name, desc, cat, rarity, artSeed, owner.id, owner.id, price, forSale ? 1 : 0, now - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)]
    );
  }

  // Активность для ленты
  for (let i = 0; i < Math.min(6, ids.length); i++) {
    const [rows] = await pool.query('SELECT name, ownerId FROM assets WHERE id=?', [ids[i]]);
    const a = rows[0];
    if (a) {
      await pool.query(
        'INSERT INTO activity (id,type,text,userId,assetId,createdAt) VALUES (?,?,?,?,?,?)',
        [newId(), 'mint', `создал актив «${a.name}»`, a.ownerId, ids[i], now - i * 1000 * 60 * 37]
      );
    }
  }
  console.log(`Демо-данные: ${users.length} пользователей, ${seedAssets.length} активов`);
}

/* ================================================================
 *  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 * ============================================================== */
function descriptionFor(name, category) {
  const map = {
    'Искусство':  'Уникальное генеративное произведение цифрового искусства. Каждая линия рассчитана алгоритмом и существует в единственном экземпляре.',
    'Фотография': 'Цифровой кадр, запечатлевший мимолётное состояние света и формы. Лимитированный выпуск.',
    'Музыка':     'Аудиовизуальный актив: звуковой ландшафт, преобразованный в визуальную партитуру.',
    'Игры':       'Внутриигровой коллекционный предмет с подтверждённой подлинностью и историей владения.',
    '3D':         'Объёмный цифровой объект, готовый к использованию в виртуальных пространствах и метавселенных.',
    'Коллекции':  'Редкий предмет из тематической коллекции. Подлинность и происхождение зафиксированы в реестре.',
  };
  return `«${name}». ${map[category] || 'Цифровой актив с уникальной обложкой.'}`;
}

function rollRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of Object.entries(RARITY_WEIGHTS)) { if ((r -= w) <= 0) return name; }
  return 'Обычный';
}

function estimateValue(a) {
  return { 'Обычный': 40, 'Редкий': 150, 'Эпический': 300, 'Легендарный': 850 }[a.rarity] || 50;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, balance: u.balance, avatarSeed: u.avatarSeed, bio: u.bio || '', isAdmin: !!u.isAdmin, createdAt: u.createdAt };
}

function assetView(row) {
  return {
    id: row.id, name: row.name, description: row.description,
    category: row.category, rarity: row.rarity, artSeed: row.artSeed,
    imageUrl: row.imageUrl || null, price: row.price, forSale: !!row.forSale,
    createdAt: row.createdAt,
    likeCount: Number(row.likeCount) || 0,
    likedByMe: !!row.likedByMe,
    creator: row.creatorId ? { id: row.creatorId, username: row.creatorUsername || null, avatarSeed: row.creatorAvatarSeed ?? 0 } : null,
    owner:   row.ownerId   ? { id: row.ownerId,   username: row.ownerUsername   || null, avatarSeed: row.ownerAvatarSeed   ?? 0 } : null,
  };
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

// Полный SELECT для активов с лайками и данными владельца/создателя
function assetSql(whereClause = '1=1', viewerId = '') {
  return `SELECT a.*,
    (SELECT COUNT(*) FROM asset_likes WHERE assetId=a.id) AS likeCount,
    (SELECT IF(COUNT(*)>0,1,0) FROM asset_likes WHERE assetId=a.id AND userId=?) AS likedByMe,
    c.username AS creatorUsername, c.avatarSeed AS creatorAvatarSeed,
    o.username AS ownerUsername,   o.avatarSeed AS ownerAvatarSeed
  FROM assets a
  LEFT JOIN users c ON c.id = a.creatorId
  LEFT JOIN users o ON o.id = a.ownerId
  WHERE ${whereClause}`;
}

async function logActivity(type, text, userId, assetId) {
  await pool.query(
    'INSERT INTO activity (id,type,text,userId,assetId,createdAt) VALUES (?,?,?,?,?,?)',
    [newId(), type, text, userId, assetId || null, Date.now()]
  );
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM activity');
  if (cnt > 200) {
    await pool.query(`DELETE FROM activity ORDER BY createdAt ASC LIMIT ${cnt - 200}`);
  }
}

async function userRatingInfo(userId) {
  const [[r]] = await pool.query('SELECT COUNT(*) AS cnt, AVG(rating) AS avg FROM reviews WHERE targetUserId=?', [userId]);
  return { rating: r.avg ? Math.round(r.avg * 10) / 10 : 0, reviewCount: r.cnt || 0 };
}

async function cancelTradesInvolving(assetId, reason, exceptId = null) {
  await pool.query(
    `UPDATE trades SET status='cancelled', cancelReason=? WHERE status='open' AND id!=? AND (offeredAssetId=? OR requestedAssetId=?)`,
    [reason, exceptId || '', assetId, assetId]
  );
}

/* ================================================================
 *  MIDDLEWARE: авторизация
 * ============================================================== */
async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    user.isAdmin = !!user.isAdmin;
    user.isGuest = !!user.isGuest;
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Недействительный токен' }); }
}

async function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  req.user = null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [payload.uid]);
      if (user) { user.isAdmin = !!user.isAdmin; user.isGuest = !!user.isGuest; req.user = user; }
    } catch {}
  }
  next();
}

/* ================================================================
 *  МАРШРУТЫ: АВТОРИЗАЦИЯ
 * ============================================================== */
app.post('/api/register', async (req, res) => {
  try {
    let { username, email, password } = req.body || {};
    username = (username || '').trim(); email = (email || '').trim().toLowerCase(); password = password || '';
    if (username.length < 3) return res.status(400).json({ error: 'Имя пользователя — минимум 3 символа' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Некорректный e-mail' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
    const [[eu]] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (eu) return res.status(409).json({ error: 'E-mail уже зарегистрирован' });
    const [[uu]] = await pool.query('SELECT id FROM users WHERE LOWER(username)=?', [username.toLowerCase()]);
    if (uu) return res.status(409).json({ error: 'Имя уже занято' });
    const user = { id: newId(), username, email, passwordHash: bcrypt.hashSync(password, 10), balance: 500, avatarSeed: Math.floor(Math.random() * 90), isAdmin: 0, isGuest: 0, createdAt: Date.now() };
    await pool.query('INSERT INTO users (id,username,email,passwordHash,balance,avatarSeed,bio,isAdmin,isGuest,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [user.id, user.username, user.email, user.passwordHash, user.balance, user.avatarSeed, '', 0, 0, user.createdAt]);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const lc = (login || '').trim().toLowerCase();
    const [[user]] = await pool.query('SELECT * FROM users WHERE email=? OR LOWER(username)=?', [lc, lc]);
    if (!user || !bcrypt.compareSync(password || '', user.passwordHash || ''))
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    user.isAdmin = !!user.isAdmin;
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/guest-login', async (req, res) => {
  try {
    const suffix = newId().slice(0, 5);
    const user = { id: newId(), username: `гость_${suffix}`, email: null, passwordHash: '', balance: 200, avatarSeed: Math.floor(Math.random() * 90), isAdmin: 0, isGuest: 1, createdAt: Date.now() };
    await pool.query('INSERT INTO users (id,username,email,passwordHash,balance,avatarSeed,bio,isAdmin,isGuest,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [user.id, user.username, null, '', user.balance, user.avatarSeed, '', 0, 1, user.createdAt]);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ================================================================
 *  МАРШРУТЫ: ЗАГРУЗКА ИЗОБРАЖЕНИЙ
 * ============================================================== */
app.post('/api/upload-image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const filename = req.file.filename;
    // Оптимизируем изображение через sharp
    const filepath = path.join(UPLOADS_DIR, filename);
    const buffer = await sharp(filepath).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    require('fs').writeFileSync(filepath, buffer);
    res.json({ url: '/uploads/' + filename });
  } catch (e) { res.status(400).json({ error: e.message || 'Ошибка загрузки' }); }
});

/* ================================================================
 *  МАРШРУТЫ: ПОДПИСКИ И ОТЗЫВЫ
 * ============================================================== */
app.post('/api/users/:id/follow', auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя подписаться на себя' });
    const [[t]] = await pool.query('SELECT id FROM users WHERE id=?', [targetId]);
    if (!t) return res.status(404).json({ error: 'Пользователь не найден' });
    const [[ex]] = await pool.query('SELECT 1 FROM follows WHERE followerId=? AND followingId=?', [req.user.id, targetId]);
    if (ex) {
      await pool.query('DELETE FROM follows WHERE followerId=? AND followingId=?', [req.user.id, targetId]);
    } else {
      await pool.query('INSERT INTO follows (followerId,followingId) VALUES (?,?)', [req.user.id, targetId]);
    }
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM follows WHERE followingId=?', [targetId]);
    res.json({ following: !ex, followersCount: cnt });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/users/:id/review', auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя оставить отзыв себе' });
    const [[t]] = await pool.query('SELECT id FROM users WHERE id=?', [targetId]);
    if (!t) return res.status(404).json({ error: 'Пользователь не найден' });
    const { comment, rating: r } = req.body || {};
    const rating = Number(r);
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });
    // Проверяем право на отзыв (покупка/обмен)
    const [[hasBought]] = await pool.query(
      "SELECT 1 FROM activity WHERE type='buy' AND userId=? AND assetId IN (SELECT id FROM assets WHERE creatorId=?) LIMIT 1",
      [req.user.id, targetId]
    );
    const [[hasTraded]] = await pool.query(
      "SELECT 1 FROM trades WHERE status='accepted' AND ((fromUserId=? AND toUserId=?) OR (fromUserId=? AND toUserId=?)) LIMIT 1",
      [req.user.id, targetId, targetId, req.user.id]
    );
    if (!hasBought && !hasTraded) return res.status(403).json({ error: 'Оставить отзыв можно только после покупки товара у этого продавца' });
    const [[existing]] = await pool.query('SELECT id FROM reviews WHERE authorId=? AND targetUserId=?', [req.user.id, targetId]);
    if (existing) {
      await pool.query('UPDATE reviews SET rating=?, comment=?, createdAt=? WHERE id=?', [rating, comment || '', Date.now(), existing.id]);
    } else {
      await pool.query('INSERT INTO reviews (id,authorId,targetUserId,rating,comment,createdAt) VALUES (?,?,?,?,?,?)',
        [newId(), req.user.id, targetId, rating, comment || '', Date.now()]);
    }
    const ri = await userRatingInfo(targetId);
    res.json({ ok: true, ...ri });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/users/:id/can-review', auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) return res.json({ canReview: false, reason: 'self' });
    const [[hasBought]] = await pool.query(
      "SELECT 1 FROM activity WHERE type='buy' AND userId=? AND assetId IN (SELECT id FROM assets WHERE creatorId=?) LIMIT 1",
      [req.user.id, targetId]
    );
    const [[hasTraded]] = await pool.query(
      "SELECT 1 FROM trades WHERE status='accepted' AND ((fromUserId=? AND toUserId=?) OR (fromUserId=? AND toUserId=?)) LIMIT 1",
      [req.user.id, targetId, targetId, req.user.id]
    );
    const [[alreadyReviewed]] = await pool.query('SELECT 1 FROM reviews WHERE authorId=? AND targetUserId=? LIMIT 1', [req.user.id, targetId]);
    res.json({ canReview: (hasBought || hasTraded) && !alreadyReviewed, alreadyReviewed: !!alreadyReviewed });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: ЧАТ
 * ============================================================== */
app.get('/api/chats', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await pool.query(
      `SELECT DISTINCT IF(fromId=?,toId,fromId) AS partnerId FROM messages WHERE fromId=? OR toId=?`,
      [uid, uid, uid]
    );
    const convos = [];
    for (const { partnerId } of rows) {
      const [[partner]] = await pool.query('SELECT * FROM users WHERE id=?', [partnerId]);
      const [[last]] = await pool.query('SELECT * FROM messages WHERE (fromId=? AND toId=?) OR (fromId=? AND toId=?) ORDER BY createdAt DESC LIMIT 1', [uid, partnerId, partnerId, uid]);
      const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM messages WHERE fromId=? AND toId=? AND isRead=0', [partnerId, uid]);
      convos.push({ partner: publicUser(partner), lastMessage: last || null, unread });
    }
    res.json({ conversations: convos });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/chats/:partnerId', auth, async (req, res) => {
  try {
    const { partnerId } = req.params, uid = req.user.id;
    const [[partner]] = await pool.query('SELECT * FROM users WHERE id=?', [partnerId]);
    if (!partner) return res.status(404).json({ error: 'Пользователь не найден' });
    const [msgs] = await pool.query(
      'SELECT * FROM messages WHERE (fromId=? AND toId=?) OR (fromId=? AND toId=?) ORDER BY createdAt ASC',
      [uid, partnerId, partnerId, uid]
    );
    await pool.query('UPDATE messages SET isRead=1 WHERE fromId=? AND toId=? AND isRead=0', [partnerId, uid]);
    res.json({ messages: msgs, partner: publicUser(partner) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/chats/:partnerId', auth, async (req, res) => {
  try {
    const { partnerId } = req.params, uid = req.user.id;
    const [[partner]] = await pool.query('SELECT id FROM users WHERE id=?', [partnerId]);
    if (!partner) return res.status(404).json({ error: 'Пользователь не найден' });
    if (uid === partnerId) return res.status(400).json({ error: 'Нельзя писать себе' });
    const text = ((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
    const msg = { id: newId(), fromId: uid, toId: partnerId, text, isRead: 0, createdAt: Date.now() };
    await pool.query('INSERT INTO messages (id,fromId,toId,text,isRead,createdAt) VALUES (?,?,?,?,?,?)',
      [msg.id, msg.fromId, msg.toId, msg.text, 0, msg.createdAt]);
    res.json({ message: msg });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/chats-unread', auth, async (req, res) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM messages WHERE toId=? AND isRead=0', [req.user.id]);
    res.json({ unread: count });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: ПОДДЕРЖКА
 * ============================================================== */
app.get('/api/support', auth, async (req, res) => {
  try {
    const [[ticket]] = await pool.query('SELECT * FROM support_tickets WHERE userId=? ORDER BY createdAt DESC LIMIT 1', [req.user.id]);
    if (!ticket) return res.json({ ticket: null });
    const [msgs] = await pool.query('SELECT * FROM support_messages WHERE ticketId=? ORDER BY createdAt', [ticket.id]);
    ticket.messages = msgs.map(m => ({ from: m.fromRole, text: m.text, createdAt: m.createdAt }));
    res.json({ ticket });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/support', auth, async (req, res) => {
  try {
    const text = ((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
    let [[ticket]] = await pool.query("SELECT * FROM support_tickets WHERE userId=? AND status='open' LIMIT 1", [req.user.id]);
    if (!ticket) {
      const tid = newId();
      await pool.query('INSERT INTO support_tickets (id,userId,status,createdAt,updatedAt) VALUES (?,?,?,?,?)',
        [tid, req.user.id, 'open', Date.now(), Date.now()]);
      [[ticket]] = await pool.query('SELECT * FROM support_tickets WHERE id=?', [tid]);
    }
    await pool.query('INSERT INTO support_messages (ticketId,fromRole,text,createdAt) VALUES (?,?,?,?)',
      [ticket.id, 'user', text, Date.now()]);
    await pool.query('UPDATE support_tickets SET updatedAt=? WHERE id=?', [Date.now(), ticket.id]);
    const [msgs] = await pool.query('SELECT * FROM support_messages WHERE ticketId=? ORDER BY createdAt', [ticket.id]);
    ticket.messages = msgs.map(m => ({ from: m.fromRole, text: m.text, createdAt: m.createdAt }));
    res.json({ ticket });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/support/admin', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Нет доступа' });
    const [tickets] = await pool.query('SELECT * FROM support_tickets ORDER BY createdAt DESC');
    for (const t of tickets) {
      const [msgs] = await pool.query('SELECT * FROM support_messages WHERE ticketId=? ORDER BY createdAt', [t.id]);
      t.messages = msgs.map(m => ({ from: m.fromRole, text: m.text, createdAt: m.createdAt }));
    }
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/support/:ticketId/reply', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Нет доступа' });
    const text = ((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустой ответ' });
    const [[ticket]] = await pool.query('SELECT * FROM support_tickets WHERE id=?', [req.params.ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    await pool.query('INSERT INTO support_messages (ticketId,fromRole,text,createdAt) VALUES (?,?,?,?)',
      [ticket.id, 'admin', text, Date.now()]);
    await pool.query('UPDATE support_tickets SET updatedAt=? WHERE id=?', [Date.now(), ticket.id]);
    const [msgs] = await pool.query('SELECT * FROM support_messages WHERE ticketId=? ORDER BY createdAt', [ticket.id]);
    ticket.messages = msgs.map(m => ({ from: m.fromRole, text: m.text, createdAt: m.createdAt }));
    res.json({ ticket });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/support/:ticketId/close', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Нет доступа' });
    const [[ticket]] = await pool.query('SELECT * FROM support_tickets WHERE id=?', [req.params.ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
    await pool.query('UPDATE support_tickets SET status=?,updatedAt=? WHERE id=?', ['closed', Date.now(), ticket.id]);
    res.json({ ticket: { ...ticket, status: 'closed' } });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: МЕТА
 * ============================================================== */
app.get('/api/meta', (_req, res) => res.json({ categories: CATEGORIES, rarities: Object.keys(RARITY_WEIGHTS) }));

/* ================================================================
 *  МАРШРУТЫ: АКТИВЫ
 * ============================================================== */
app.get('/api/assets', optionalAuth, async (req, res) => {
  try {
    const { category, rarity, search, sort, forSale } = req.query;
    const viewerId = req.user ? req.user.id : '';
    let where = '1=1'; const params = [viewerId];
    if (category && category !== 'Все') { where += ' AND a.category=?'; params.push(category); }
    if (rarity && rarity !== 'Все') { where += ' AND a.rarity=?'; params.push(rarity); }
    if (forSale === 'true') where += ' AND a.forSale=1';
    if (search) { const q = `%${search}%`; where += ' AND (a.name LIKE ? OR a.description LIKE ?)'; params.push(q, q); }
    const orderMap = { price_asc: 'a.price ASC', price_desc: 'a.price DESC', popular: 'likeCount DESC', oldest: 'a.createdAt ASC' };
    const orderBy = orderMap[sort] || 'a.createdAt DESC';
    const [rows] = await pool.query(`${assetSql(where)} ORDER BY ${orderBy}`, params);
    res.json({ assets: rows.map(assetView) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/assets/:id', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user ? req.user.id : '';
    const [[a]] = await pool.query(`${assetSql('a.id=?')} `, [viewerId, req.params.id]);
    if (!a) return res.status(404).json({ error: 'Актив не найден' });
    const [hist] = await pool.query(
      'SELECT ac.*, u.username, u.avatarSeed FROM activity ac LEFT JOIN users u ON u.id=ac.userId WHERE ac.assetId=? ORDER BY ac.createdAt DESC LIMIT 12',
      [a.id]
    );
    res.json({ asset: assetView(a), history: hist });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/assets', auth, async (req, res) => {
  try {
    let { name, description, category, imageUrl, artSeed: reqSeed } = req.body || {};
    name = (name || '').trim(); description = (description || '').trim();
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Название: от 2 до 60 символов' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Неизвестная категория' });
    const rarity = rollRarity();
    const artSeed = Number.isInteger(Number(reqSeed)) && Number(reqSeed) >= 0 ? Number(reqSeed) : Math.floor(Math.random() * 1000000);
    const safeImageUrl = (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('/uploads/')) ? imageUrl : null;
    const asset = { id: newId(), name, description: description || descriptionFor(name, category), category, rarity, artSeed, imageUrl: safeImageUrl, creatorId: req.user.id, ownerId: req.user.id, price: 0, forSale: 0, createdAt: Date.now() };
    await pool.query('INSERT INTO assets (id,name,description,category,rarity,artSeed,imageUrl,creatorId,ownerId,price,forSale,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [asset.id, asset.name, asset.description, asset.category, asset.rarity, asset.artSeed, asset.imageUrl, asset.creatorId, asset.ownerId, 0, 0, asset.createdAt]);
    await logActivity('mint', `создал актив «${asset.name}» (${rarity})`, req.user.id, asset.id);
    const [[fresh]] = await pool.query(`${assetSql('a.id=?')}`, [req.user.id, asset.id]);
    res.json({ asset: assetView(fresh) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/assets/:id/list', auth, async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT * FROM assets WHERE id=?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Актив не найден' });
    if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
    const price = Math.round(Number((req.body || {}).price));
    if (!Number.isFinite(price) || price < 1 || price > 1000000) return res.status(400).json({ error: 'Укажите цену от 1 до 1 000 000' });
    await pool.query('UPDATE assets SET forSale=1, price=? WHERE id=?', [price, a.id]);
    await logActivity('list', `выставил «${a.name}» за ${price} ◈`, req.user.id, a.id);
    const [[fresh]] = await pool.query(`${assetSql('a.id=?')}`, [req.user.id, a.id]);
    res.json({ asset: assetView(fresh) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/assets/:id/unlist', auth, async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT * FROM assets WHERE id=?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Актив не найден' });
    if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
    await pool.query('UPDATE assets SET forSale=0 WHERE id=?', [a.id]);
    const [[fresh]] = await pool.query(`${assetSql('a.id=?')}`, [req.user.id, a.id]);
    res.json({ asset: assetView(fresh) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/assets/:id/delete', auth, async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT * FROM assets WHERE id=?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Актив не найден' });
    if (a.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владелец актива' });
    await cancelTradesInvolving(a.id, 'актив удалён');
    await pool.query('DELETE FROM assets WHERE id=?', [a.id]);
    await pool.query('DELETE FROM asset_likes WHERE assetId=?', [a.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/assets/:id/buy', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[a]] = await conn.query('SELECT * FROM assets WHERE id=? FOR UPDATE', [req.params.id]);
    if (!a) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Актив не найден' }); }
    if (!a.forSale) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Актив не продаётся' }); }
    if (a.ownerId === req.user.id) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Это уже ваш актив' }); }
    const [[buyer]] = await conn.query('SELECT balance FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    if (buyer.balance < a.price) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Недостаточно кредитов' }); }
    await conn.query('UPDATE users SET balance=balance-? WHERE id=?', [a.price, req.user.id]);
    await conn.query('UPDATE users SET balance=balance+? WHERE id=?', [a.price, a.ownerId]);
    await conn.query('UPDATE assets SET ownerId=?, forSale=0 WHERE id=?', [req.user.id, a.id]);
    await conn.query("UPDATE trades SET status='cancelled', cancelReason='актив сменил владельца' WHERE status='open' AND (offeredAssetId=? OR requestedAssetId=?)", [a.id, a.id]);
    await conn.commit();
    conn.release();
    await logActivity('buy', `купил «${a.name}» за ${a.price} ◈`, req.user.id, a.id);
    const [[freshUser]] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    const [[fresh]] = await pool.query(`${assetSql('a.id=?')}`, [req.user.id, a.id]);
    res.json({ asset: assetView(fresh), balance: freshUser.balance });
  } catch (e) {
    await conn.rollback(); conn.release();
    console.error(e); res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/assets/:id/like', auth, async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT id FROM assets WHERE id=?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Актив не найден' });
    const [[ex]] = await pool.query('SELECT 1 FROM asset_likes WHERE assetId=? AND userId=?', [a.id, req.user.id]);
    if (ex) { await pool.query('DELETE FROM asset_likes WHERE assetId=? AND userId=?', [a.id, req.user.id]); }
    else     { await pool.query('INSERT INTO asset_likes (assetId,userId) VALUES (?,?)', [a.id, req.user.id]); }
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM asset_likes WHERE assetId=?', [a.id]);
    res.json({ likeCount: cnt, likedByMe: !ex });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: ПОЛЬЗОВАТЕЛИ И ЛИДЕРБОРД
 * ============================================================== */
app.get('/api/users/:id', optionalAuth, async (req, res) => {
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
    const viewerId = req.user ? req.user.id : '';
    const [owned] = await pool.query(`${assetSql('a.ownerId=?')}`, [viewerId, u.id]);
    const [[{ created }]] = await pool.query('SELECT COUNT(*) AS created FROM assets WHERE creatorId=?', [u.id]);
    const [[{ followersCount }]] = await pool.query('SELECT COUNT(*) AS followersCount FROM follows WHERE followingId=?', [u.id]);
    const [[{ followingCount }]] = await pool.query('SELECT COUNT(*) AS followingCount FROM follows WHERE followerId=?', [u.id]);
    const [[isFollowingRow]] = await pool.query('SELECT 1 AS f FROM follows WHERE followerId=? AND followingId=?', [viewerId || '', u.id]);
    const ri = await userRatingInfo(u.id);
    const [revRows] = await pool.query(
      'SELECT rv.*, u2.username AS authorUsername, u2.avatarSeed AS authorAvatarSeed FROM reviews rv LEFT JOIN users u2 ON u2.id=rv.authorId WHERE rv.targetUserId=? ORDER BY rv.createdAt DESC LIMIT 20',
      [u.id]
    );
    const collectionValue = owned.reduce((s, a) => s + (a.price || estimateValue(a)), 0);
    res.json({
      user: publicUser(u),
      stats: { owned: owned.length, created, collectionValue, followersCount, followingCount },
      isFollowing: !!isFollowingRow,
      rating: ri.rating, reviewCount: ri.reviewCount, reviews: revRows,
      owned: owned.map(assetView),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE isGuest=0');
    const board = [];
    for (const u of users) {
      const [owned] = await pool.query('SELECT price, rarity FROM assets WHERE ownerId=?', [u.id]);
      board.push({
        user: publicUser(u),
        count: owned.length,
        value: owned.reduce((s, a) => s + (a.price || estimateValue(a)), 0),
        legendary: owned.filter((a) => a.rarity === 'Легендарный').length,
      });
    }
    board.sort((a, b) => b.value - a.value);
    res.json({ leaderboard: board });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: ОБМЕН (P2P)
 * ============================================================== */
async function buildTradeView(t) {
  const viewerId = t.fromUserId || '';
  const [[offRow]] = await pool.query(`${assetSql('a.id=?')}`, [viewerId, t.offeredAssetId]);
  const [[reqRow]] = await pool.query(`${assetSql('a.id=?')}`, [viewerId, t.requestedAssetId]);
  const [[from]] = await pool.query('SELECT id,username,avatarSeed FROM users WHERE id=?', [t.fromUserId]);
  const [[to_]] = await pool.query('SELECT id,username,avatarSeed FROM users WHERE id=?', [t.toUserId]);
  return { id: t.id, status: t.status, createdAt: t.createdAt, from: from || null, to: to_ || null, offered: offRow ? assetView(offRow) : null, requested: reqRow ? assetView(reqRow) : null };
}

app.post('/api/trades', auth, async (req, res) => {
  try {
    const { offeredAssetId, requestedAssetId } = req.body || {};
    const [[offered]] = await pool.query('SELECT * FROM assets WHERE id=?', [offeredAssetId]);
    const [[requested]] = await pool.query('SELECT * FROM assets WHERE id=?', [requestedAssetId]);
    if (!offered || !requested) return res.status(404).json({ error: 'Актив не найден' });
    if (offered.id === requested.id) return res.status(400).json({ error: 'Нельзя обменять актив сам на себя' });
    if (offered.ownerId !== req.user.id) return res.status(403).json({ error: 'Вы не владеете предлагаемым активом' });
    if (requested.ownerId === req.user.id) return res.status(400).json({ error: 'Запрашиваемый актив уже ваш' });
    const [[ex]] = await pool.query("SELECT 1 FROM trades WHERE status='open' AND offeredAssetId=? AND requestedAssetId=? AND fromUserId=?", [offered.id, requested.id, req.user.id]);
    if (ex) return res.status(409).json({ error: 'Такое предложение уже отправлено' });
    const trade = { id: newId(), fromUserId: req.user.id, toUserId: requested.ownerId, offeredAssetId: offered.id, requestedAssetId: requested.id, status: 'open', createdAt: Date.now() };
    await pool.query('INSERT INTO trades (id,fromUserId,toUserId,offeredAssetId,requestedAssetId,status,createdAt) VALUES (?,?,?,?,?,?,?)',
      [trade.id, trade.fromUserId, trade.toUserId, trade.offeredAssetId, trade.requestedAssetId, 'open', trade.createdAt]);
    await logActivity('trade_offer', `предложил обмен: «${offered.name}» ⇄ «${requested.name}»`, req.user.id, requested.id);
    res.json({ trade: await buildTradeView(trade) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/trades', auth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM trades WHERE fromUserId=? OR toUserId=? ORDER BY createdAt DESC", [req.user.id, req.user.id]);
    const views = await Promise.all(rows.map(buildTradeView));
    res.json({ incoming: views.filter((_, i) => rows[i].toUserId === req.user.id), outgoing: views.filter((_, i) => rows[i].fromUserId === req.user.id) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/trades/:id/accept', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query('SELECT * FROM trades WHERE id=?', [req.params.id]);
    if (!t || t.status !== 'open') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Предложение недоступно' }); }
    if (t.toUserId !== req.user.id) { await conn.rollback(); conn.release(); return res.status(403).json({ error: 'Нельзя принять чужое предложение' }); }
    const [[offered]] = await conn.query('SELECT * FROM assets WHERE id=? FOR UPDATE', [t.offeredAssetId]);
    const [[requested]] = await conn.query('SELECT * FROM assets WHERE id=? FOR UPDATE', [t.requestedAssetId]);
    if (!offered || !requested) { await conn.query("UPDATE trades SET status='cancelled' WHERE id=?", [t.id]); await conn.commit(); conn.release(); return res.status(400).json({ error: 'Актив недоступен' }); }
    if (offered.ownerId !== t.fromUserId || requested.ownerId !== t.toUserId) {
      await conn.query("UPDATE trades SET status='cancelled' WHERE id=?", [t.id]); await conn.commit(); conn.release();
      return res.status(400).json({ error: 'Состав владельцев изменился, обмен отменён' });
    }
    await conn.query('UPDATE assets SET ownerId=?, forSale=0 WHERE id=?', [t.toUserId, offered.id]);
    await conn.query('UPDATE assets SET ownerId=?, forSale=0 WHERE id=?', [t.fromUserId, requested.id]);
    await conn.query("UPDATE trades SET status='accepted' WHERE id=?", [t.id]);
    await conn.query("UPDATE trades SET status='cancelled', cancelReason='актив участвовал в другом обмене' WHERE status='open' AND id!=? AND (offeredAssetId IN (?,?) OR requestedAssetId IN (?,?))",
      [t.id, offered.id, requested.id, offered.id, requested.id]);
    await conn.commit(); conn.release();
    await logActivity('trade_done', `обменялся: «${offered.name}» ⇄ «${requested.name}»`, req.user.id, requested.id);
    const [[freshT]] = await pool.query('SELECT * FROM trades WHERE id=?', [t.id]);
    res.json({ trade: await buildTradeView(freshT) });
  } catch (e) { await conn.rollback(); conn.release(); console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/trades/:id/decline', auth, async (req, res) => {
  try {
    const [[t]] = await pool.query('SELECT * FROM trades WHERE id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Предложение не найдено' });
    if (t.status !== 'open') return res.status(400).json({ error: 'Предложение уже закрыто' });
    if (t.fromUserId !== req.user.id && t.toUserId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
    const newStatus = t.fromUserId === req.user.id ? 'cancelled' : 'declined';
    await pool.query('UPDATE trades SET status=? WHERE id=?', [newStatus, t.id]);
    const [[fresh]] = await pool.query('SELECT * FROM trades WHERE id=?', [t.id]);
    res.json({ trade: await buildTradeView(fresh) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: АКТИВНОСТЬ И СТАТИСТИКА
 * ============================================================== */
app.get('/api/activity', async (_req, res) => {
  try {
    const [items] = await pool.query(
      'SELECT ac.*, u.username, u.avatarSeed, a.name AS assetName, a.artSeed AS assetArtSeed, a.rarity AS assetRarity FROM activity ac LEFT JOIN users u ON u.id=ac.userId LEFT JOIN assets a ON a.id=ac.assetId ORDER BY ac.createdAt DESC LIMIT 25'
    );
    res.json({ activity: items.map(e => ({ ...e, asset: e.assetId ? { id: e.assetId, name: e.assetName, artSeed: e.assetArtSeed, rarity: e.assetRarity } : null })) });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/stats', async (_req, res) => {
  try {
    const [[u]] = await pool.query('SELECT COUNT(*) AS c FROM users WHERE isGuest=0');
    const [[a]] = await pool.query('SELECT COUNT(*) AS c FROM assets');
    const [[s]] = await pool.query('SELECT COUNT(*) AS c FROM assets WHERE forSale=1');
    const [[t]] = await pool.query("SELECT COUNT(*) AS c FROM trades WHERE status='accepted'");
    const [[v]] = await pool.query("SELECT COUNT(*) AS c FROM activity WHERE type='buy'");
    res.json({ users: u.c, assets: a.c, forSale: s.c, trades: t.c, sales: v.c });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* ================================================================
 *  МАРШРУТЫ: КОШЕЛЁК
 * ============================================================== */
app.post('/api/wallet/deposit', auth, async (req, res) => {
  try {
    const { amount, method } = req.body || {};
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n < 1 || n > 1000000) return res.status(400).json({ error: 'Укажите сумму от 1 до 1 000 000' });
    if (!['card', 'qr', 'phone'].includes(method)) return res.status(400).json({ error: 'Неизвестный метод' });
    await pool.query('UPDATE users SET balance=balance+? WHERE id=?', [n, req.user.id]);
    await logActivity('deposit', `пополнил баланс на ${n} ◈`, req.user.id, null);
    const [[{ balance }]] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    res.json({ balance, credited: n });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/wallet/withdraw', auth, async (req, res) => {
  try {
    const { amount, method } = req.body || {};
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Укажите сумму от 1' });
    const [[{ balance }]] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    if (n > balance) return res.status(400).json({ error: 'Недостаточно средств на балансе' });
    if (!['card_rf', 'crypto', 'ptp'].includes(method)) return res.status(400).json({ error: 'Неизвестный метод' });
    await pool.query('UPDATE users SET balance=balance-? WHERE id=?', [n, req.user.id]);
    await logActivity('withdraw', `вывел ${n} ◈`, req.user.id, null);
    const [[fresh]] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    res.json({ balance: fresh.balance, withdrawn: n });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/wallet/transfer', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { toUsername, amount } = req.body || {};
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n < 1) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Укажите сумму от 1' }); }
    const [[sender]] = await conn.query('SELECT balance FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    if (n > sender.balance) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Недостаточно средств на балансе' }); }
    const [[recipient]] = await conn.query('SELECT * FROM users WHERE LOWER(username)=? FOR UPDATE', [(toUsername || '').trim().toLowerCase()]);
    if (!recipient) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Пользователь не найден' }); }
    if (recipient.id === req.user.id) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Нельзя переводить себе' }); }
    await conn.query('UPDATE users SET balance=balance-? WHERE id=?', [n, req.user.id]);
    await conn.query('UPDATE users SET balance=balance+? WHERE id=?', [n, recipient.id]);
    await conn.commit(); conn.release();
    await logActivity('transfer', `перевёл ${n} ◈ → ${recipient.username}`, req.user.id, null);
    const [[fresh]] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    res.json({ balance: fresh.balance, transferred: n, to: recipient.username });
  } catch (e) { await conn.rollback(); conn.release(); console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

/* SPA fallback */
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Запуск ---------- */
initDb()
  .then(() => app.listen(PORT, () => console.log(`\n  ARTEFACT запущен → http://localhost:${PORT}\n`)))
  .catch(err => { console.error('❌ Ошибка подключения к MySQL:', err.message); process.exit(1); });
