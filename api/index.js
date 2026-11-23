// api/index.js — Vercel Serverless 호환 UniPick API 핸들러 (순수 JS, 네이티브 애드온 불필요)
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { universityData, POPULAR_MAJORS, DATA_SOURCES } = require('../data/universities');
const { analyzeAdmission, VALID_CATEGORIES } = require('../services/analysis');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'unipick_jwt_secret_key_2026';
const STORE_PATH = path.join(os.tmpdir(), 'unipick-serverless-store.json');

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));

// ── 경량 /tmp JSON 스토어 (Vercel 서버리스 인스턴스 내 상태 유지) ──
let memoryStore = { nextUserId: 1, nextConsultId: 1, users: [], consultations: [], bookmarks: [] };

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.users)) {
        memoryStore = parsed;
      }
    }
  } catch {
    // 인메모리 폴백 유지
  }
  return memoryStore;
}

function saveStore(store) {
  memoryStore = store;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store));
  } catch {
    // 쓰기 불가 환경은 인메모리 유지
  }
}

const VALID_AVATARS = ['obsidian', 'graphite', 'emerald', 'cobalt', 'amber'];

function serializeUser(user, consultationCount = undefined) {
  if (!user) return null;
  const out = {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: VALID_AVATARS.includes(user.avatar) ? user.avatar : 'obsidian',
    statusMessage: user.statusMessage || '',
    targetScore: Number(user.targetScore) || 385,
    targetMajor: user.targetMajor || '컴퓨터공학부',
    targetUniversity: user.targetUniversity || '성균관대학교',
    examTrack: VALID_CATEGORIES.includes(user.examTrack) ? user.examTrack : '자연',
    createdAt: user.createdAt || null,
  };
  if (typeof consultationCount === 'number') out.consultationCount = consultationCount;
  return out;
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '인증이 만료되었습니다. 다시 로그인해주세요.' });
  }
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
    } catch {
      // 비로그인 처리
    }
  }
  next();
}

// ── 헬스체크 & 대학 목록 ──
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', universities: universityData.length, runtime: 'vercel' });
});

app.get('/api/universities', (req, res) => {
  const { category, q } = req.query;
  let items = universityData;

  if (category && VALID_CATEGORIES.includes(category)) {
    items = items.filter((u) => (u.departments[category] || []).length > 0);
  }
  if (q && typeof q === 'string' && q.trim()) {
    const kw = q.trim().toLowerCase();
    items = items.filter(
      (u) =>
        u.university.toLowerCase().includes(kw) ||
        u.shortName.toLowerCase().includes(kw) ||
        Object.values(u.departments).some((depts) => depts.some((d) => d.toLowerCase().includes(kw)))
    );
  }

  res.json({ success: true, universities: items, popularMajors: POPULAR_MAJORS, dataSources: DATA_SOURCES });
});

// ── 인증 ──
app.post('/api/register', (req, res) => {
  const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const rawDisplayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';

  if (!rawUsername || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(rawUsername)) {
    return res.status(400).json({
      success: false,
      error: '아이디는 3~20자의 영문, 숫자, 밑줄(_), 마침표(.), 하이픈(-)만 사용할 수 있습니다.',
    });
  }
  if (password.length < 4 || password.length > 72) {
    return res.status(400).json({ success: false, error: '비밀번호는 4자 이상 72자 이하로 입력해주세요.' });
  }

  const store = loadStore();
  if (store.users.some((u) => u.username === rawUsername)) {
    return res.status(409).json({ success: false, error: '이미 사용 중인 아이디입니다.' });
  }

  const rawTargetScore = Number(req.body.targetScore);
  const newUser = {
    id: store.nextUserId++,
    username: rawUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    displayName: rawDisplayName || rawUsername,
    avatar: VALID_AVATARS.includes(req.body.avatar) ? req.body.avatar : 'obsidian',
    statusMessage: typeof req.body.statusMessage === 'string' ? req.body.statusMessage.trim().slice(0, 60) : '',
    targetScore: Number.isFinite(rawTargetScore) && rawTargetScore >= 200 && rawTargetScore <= 450 ? Math.round(rawTargetScore) : 385,
    targetMajor: typeof req.body.targetMajor === 'string' && req.body.targetMajor.trim() ? req.body.targetMajor.trim().slice(0, 40) : '컴퓨터공학부',
    targetUniversity: typeof req.body.targetUniversity === 'string' && req.body.targetUniversity.trim() ? req.body.targetUniversity.trim().slice(0, 40) : '성균관대학교',
    examTrack: VALID_CATEGORIES.includes(req.body.examTrack) ? req.body.examTrack : '자연',
    createdAt: new Date().toISOString(),
  };
  store.users.push(newUser);
  saveStore(store);

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ success: true, token, user: serializeUser(newUser, 0) });
});

app.post('/api/demo-login', (req, res) => {
  const store = loadStore();
  let user = store.users.find((u) => u.username === 'demo_student');
  if (!user) {
    user = {
      id: store.nextUserId++,
      username: 'demo_student',
      passwordHash: bcrypt.hashSync('unipick2026', 10),
      displayName: '김유니 (수험생 체험)',
      avatar: 'obsidian',
      statusMessage: '2026 정시 컴퓨터공학부 목표 달성!',
      targetScore: 388,
      targetMajor: '컴퓨터공학부',
      targetUniversity: '성균관대학교',
      examTrack: '자연',
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    saveStore(store);
  }
  const count = store.consultations.filter((c) => c.userId === user.id).length;
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: serializeUser(user, count) });
});

app.post('/api/login', (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
  }

  const store = loadStore();
  const user = store.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const count = store.consultations.filter((c) => c.userId === user.id).length;
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: serializeUser(user, count) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const store = loadStore();
  const user = store.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
  const count = store.consultations.filter((c) => c.userId === user.id).length;
  res.json({ success: true, user: serializeUser(user, count) });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const rawName = req.body.displayName ?? req.body.display_name;
  const displayName = typeof rawName === 'string' ? rawName.trim() : '';
  if (!displayName || displayName.length > 30) {
    return res.status(400).json({ success: false, error: '표시 이름은 1~30자로 입력해주세요.' });
  }
  const store = loadStore();
  const user = store.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });

  user.displayName = displayName;
  if (VALID_AVATARS.includes(req.body.avatar)) user.avatar = req.body.avatar;
  if (req.body.statusMessage !== undefined) {
    user.statusMessage = String(req.body.statusMessage || '').trim().slice(0, 60);
  }
  if (req.body.targetScore !== undefined) {
    const sc = Number(req.body.targetScore);
    if (Number.isFinite(sc) && sc >= 200 && sc <= 450) user.targetScore = Math.round(sc);
  }
  if (typeof req.body.targetMajor === 'string' && req.body.targetMajor.trim()) {
    user.targetMajor = req.body.targetMajor.trim().slice(0, 40);
  }
  if (typeof req.body.targetUniversity === 'string' && req.body.targetUniversity.trim()) {
    user.targetUniversity = req.body.targetUniversity.trim().slice(0, 40);
  }
  if (VALID_CATEGORIES.includes(req.body.examTrack)) {
    user.examTrack = req.body.examTrack;
  }

  saveStore(store);
  const count = store.consultations.filter((c) => c.userId === user.id).length;
  res.json({ success: true, user: serializeUser(user, count) });
});

app.put('/api/password', authMiddleware, (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
  }
  if (newPassword.length < 4 || newPassword.length > 72) {
    return res.status(400).json({ success: false, error: '새 비밀번호는 4자 이상 72자 이하로 입력해주세요.' });
  }
  const store = loadStore();
  const user = store.users.find((u) => u.id === req.userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(401).json({ success: false, error: '현재 비밀번호가 일치하지 않습니다.' });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveStore(store);
  res.json({ success: true });
});

// ── 성적 분석 ──
app.post('/api/consult', optionalAuth, (req, res) => {
  const { score, major, category, englishGrade, subjects = null, save = true } = req.body || {};
  const scoreStr = String(score ?? '').trim();
  if (!scoreStr || !/^\d+(\.\d+)?$/.test(scoreStr)) {
    return res.status(400).json({ success: false, error: '수능 표준점수 합을 숫자로 입력해주세요.' });
  }
  const scoreNum = Math.round(Number(scoreStr));
  if (!Number.isFinite(scoreNum) || scoreNum < 200 || scoreNum > 450) {
    return res.status(400).json({ success: false, error: '유효한 표준점수 합(200~450점)을 입력해주세요.' });
  }
  const cleanMajor = typeof major === 'string' ? major.trim() : '';
  if (!cleanMajor || cleanMajor.length > 60) {
    return res.status(400).json({ success: false, error: '희망 학과를 1~60자 이내로 입력해주세요.' });
  }

  const categoryOverride = VALID_CATEGORIES.includes(category) ? category : null;
  const parsedEnglish = englishGrade !== undefined ? Number(englishGrade) : 1;
  const safeEnglishGrade = Number.isInteger(parsedEnglish) && parsedEnglish >= 1 && parsedEnglish <= 5 ? parsedEnglish : 1;

  const analysis = analyzeAdmission({
    score: scoreNum,
    major: cleanMajor,
    categoryOverride,
    englishGrade: safeEnglishGrade,
    subjects: subjects && typeof subjects === 'object' ? subjects : null,
  });

  let consultationId = null;
  let saved = false;

  if (req.userId && save !== false) {
    const store = loadStore();
    const record = {
      id: store.nextConsultId++,
      userId: req.userId,
      score: scoreNum,
      major: cleanMajor,
      category: analysis.meta.category,
      level: analysis.meta.level,
      meta: analysis.meta,
      created_at: new Date().toISOString(),
    };
    store.consultations.unshift(record);
    saveStore(store);
    consultationId = record.id;
    saved = true;
  }

  res.json({ success: true, consultationId, saved, ...analysis });
});

// ── 분석 내역 ──
app.get('/api/consultations', authMiddleware, (req, res) => {
  const store = loadStore();
  const consultations = store.consultations
    .filter((c) => c.userId === req.userId)
    .map((c) => ({
      id: c.id,
      score: c.score,
      major: c.major,
      category: c.category,
      level: c.level,
      reachCount: c.meta?.reachCount ?? null,
      targetCount: c.meta?.targetCount ?? null,
      safetyCount: c.meta?.safetyCount ?? null,
      englishGrade: c.meta?.englishGrade ?? 1,
      created_at: c.created_at,
    }));
  res.json({ success: true, consultations });
});

app.get('/api/consultations/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: '유효하지 않은 내역 ID입니다.' });
  }
  const store = loadStore();
  const row = store.consultations.find((c) => c.id === id && c.userId === req.userId);
  if (!row) return res.status(404).json({ success: false, error: '분석 내역을 찾을 수 없습니다.' });

  const hydrated = analyzeAdmission({
    score: row.score,
    major: row.major,
    categoryOverride: VALID_CATEGORIES.includes(row.category) ? row.category : null,
    englishGrade: row.meta?.englishGrade || 1,
    subjects: row.meta?.subjectProfile || null,
  });

  res.json({
    success: true,
    consultation: {
      id: row.id,
      score: row.score,
      major: row.major,
      category: row.category,
      level: row.level,
      created_at: row.created_at,
      result_meta: hydrated.meta,
      analysis: hydrated,
    },
  });
});

app.delete('/api/consultations/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const store = loadStore();
  const before = store.consultations.length;
  store.consultations = store.consultations.filter((c) => !(c.id === id && c.userId === req.userId));
  if (store.consultations.length === before) {
    return res.status(404).json({ success: false, error: '삭제할 분석 내역을 찾을 수 없습니다.' });
  }
  saveStore(store);
  res.json({ success: true });
});

// ── 관심 대학 북마크 ──
app.get('/api/bookmarks', authMiddleware, (req, res) => {
  const store = loadStore();
  const bookmarks = store.bookmarks
    .filter((b) => b.userId === req.userId)
    .map((b) => {
      const uni = universityData.find((u) => u.id === b.universityId);
      return uni ? { universityId: b.universityId, department: b.department, createdAt: b.createdAt, university: uni } : null;
    })
    .filter(Boolean);
  res.json({ success: true, bookmarks });
});

app.post('/api/bookmarks', authMiddleware, (req, res) => {
  const universityId = typeof req.body?.universityId === 'string' ? req.body.universityId.trim() : '';
  const department = typeof req.body?.department === 'string' ? req.body.department.trim().slice(0, 60) : '';
  const uni = universityData.find((u) => u.id === universityId);
  if (!uni) return res.status(404).json({ success: false, error: '존재하지 않는 대학입니다.' });

  const store = loadStore();
  store.bookmarks = store.bookmarks.filter((b) => !(b.userId === req.userId && b.universityId === universityId));
  store.bookmarks.unshift({ userId: req.userId, universityId, department, createdAt: new Date().toISOString() });
  saveStore(store);
  res.status(201).json({ success: true, bookmark: { universityId, department, university: uni } });
});

app.delete('/api/bookmarks/:universityId', authMiddleware, (req, res) => {
  const universityId = String(req.params.universityId || '').trim();
  const store = loadStore();
  store.bookmarks = store.bookmarks.filter((b) => !(b.userId === req.userId && b.universityId === universityId));
  saveStore(store);
  res.json({ success: true });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: '요청한 API 경로를 찾을 수 없습니다.' });
});

module.exports = app;
