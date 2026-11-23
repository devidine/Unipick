// server.js — UniPick 정시 입시 분석 API 서버
require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { stmts } = require('./db');
const { universityData, POPULAR_MAJORS, DATA_SOURCES } = require('./data/universities');
const { analyzeAdmission, VALID_CATEGORIES } = require('./services/analysis');

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || 'unipick_jwt_secret_key_2026';

// 기본 보안 헤더 및 JSON 파싱
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));

// 정적 파일 서빙 (빌드된 React 앱 우선, 없을 시 public 폴백)
const buildDir = path.join(__dirname, 'public_build');
const fallbackPublicDir = path.join(__dirname, 'public');
const staticDir = fs.existsSync(path.join(buildDir, 'index.html')) ? buildDir : fallbackPublicDir;
app.use(express.static(staticDir));

// ═══════════════════════════════════════════════════════════════
// 유틸리티 & 인증 미들웨어
// ═══════════════════════════════════════════════════════════════

const VALID_AVATARS = ['obsidian', 'graphite', 'emerald', 'cobalt', 'amber'];

function serializeUser(row, consultationCount = undefined) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.displayName || row.username,
    avatar: VALID_AVATARS.includes(row.avatar) ? row.avatar : 'obsidian',
    statusMessage: row.status_message ?? row.statusMessage ?? '',
    targetScore: Number(row.target_score ?? row.targetScore) || 385,
    targetMajor: row.target_major || row.targetMajor || '컴퓨터공학부',
    targetUniversity: row.target_university || row.targetUniversity || '성균관대학교',
    examTrack: VALID_CATEGORIES.includes(row.exam_track || row.examTrack)
      ? row.exam_track || row.examTrack
      : '자연',
    createdAt: row.created_at || row.createdAt || null,
  };
  if (typeof consultationCount === 'number') {
    user.consultationCount = consultationCount;
  }
  return user;
}

function safeParseJson(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }
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
      // 만료/오류 토큰은 비로그인으로 처리
    }
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
// 헬스체크 & 메타데이터 API
// ═══════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', universities: universityData.length });
});

app.get('/api/universities', (req, res) => {
  const { category, q } = req.query;
  let items = universityData;

  if (category && VALID_CATEGORIES.includes(category)) {
    items = items.filter((u) => (u.departments[category] || []).length > 0);
  }

  if (q && typeof q === 'string' && q.trim()) {
    const keyword = q.trim().toLowerCase();
    items = items.filter((u) => {
      if (u.university.toLowerCase().includes(keyword) || u.shortName.toLowerCase().includes(keyword)) {
        return true;
      }
      return Object.values(u.departments).some((depts) =>
        depts.some((d) => d.toLowerCase().includes(keyword))
      );
    });
  }

  res.json({
    success: true,
    universities: items,
    popularMajors: POPULAR_MAJORS,
    dataSources: DATA_SOURCES,
  });
});

// ═══════════════════════════════════════════════════════════════
// 인증 API
// ═══════════════════════════════════════════════════════════════

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
  if (rawDisplayName.length > 30) {
    return res.status(400).json({ success: false, error: '이름은 30자 이하로 입력해주세요.' });
  }

  const existing = stmts.findUserByUsername.get(rawUsername);
  if (existing) {
    return res.status(409).json({ success: false, error: '이미 사용 중인 아이디입니다.' });
  }

  const displayName = rawDisplayName || rawUsername;
  const avatar = VALID_AVATARS.includes(req.body.avatar) ? req.body.avatar : 'obsidian';
  const statusMessage = typeof req.body.statusMessage === 'string' ? req.body.statusMessage.trim().slice(0, 60) : '';
  const rawTargetScore = Number(req.body.targetScore);
  const targetScore = Number.isFinite(rawTargetScore) && rawTargetScore >= 200 && rawTargetScore <= 450 ? Math.round(rawTargetScore) : 385;
  const targetMajor = typeof req.body.targetMajor === 'string' && req.body.targetMajor.trim() ? req.body.targetMajor.trim().slice(0, 40) : '컴퓨터공학부';
  const targetUniversity = typeof req.body.targetUniversity === 'string' && req.body.targetUniversity.trim() ? req.body.targetUniversity.trim().slice(0, 40) : '성균관대학교';
  const examTrack = VALID_CATEGORIES.includes(req.body.examTrack) ? req.body.examTrack : '자연';

  const hash = bcrypt.hashSync(password, 10);
  const result = stmts.createUser.run(
    rawUsername,
    hash,
    displayName,
    avatar,
    statusMessage,
    targetScore,
    targetMajor,
    targetUniversity,
    examTrack
  );
  const createdUser = stmts.findUserById.get(result.lastInsertRowid);
  const token = jwt.sign({ userId: createdUser.id }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({
    success: true,
    token,
    user: serializeUser(createdUser, 0),
  });
});

// 원클릭 체험 계정 로그인
app.post('/api/demo-login', (req, res) => {
  const demoUsername = 'demo_student';
  let user = stmts.findUserByUsername.get(demoUsername);
  if (!user) {
    const hash = bcrypt.hashSync('unipick2026', 10);
    const result = stmts.createUser.run(
      demoUsername,
      hash,
      '김유니 (수험생 체험)',
      'obsidian',
      '2026 정시 컴퓨터공학부 목표 달성!',
      388,
      '컴퓨터공학부',
      '성균관대학교',
      '자연'
    );
    user = stmts.findUserById.get(result.lastInsertRowid);
  }
  const countRow = stmts.countConsultationsByUser.get(user.id);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    success: true,
    token,
    user: serializeUser(user, countRow ? countRow.count : 0),
  });
});

app.post('/api/login', (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
  }

  const user = stmts.findUserByUsername.get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const countRow = stmts.countConsultationsByUser.get(user.id);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    success: true,
    token,
    user: serializeUser(user, countRow ? countRow.count : 0),
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = stmts.findUserById.get(req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
  }
  const countRow = stmts.countConsultationsByUser.get(user.id);
  res.json({
    success: true,
    user: serializeUser(user, countRow ? countRow.count : 0),
  });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const current = stmts.findUserById.get(req.userId);
  if (!current) {
    return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
  }

  const rawName = req.body.displayName ?? req.body.display_name;
  const displayName = typeof rawName === 'string' ? rawName.trim() : '';

  if (!displayName || displayName.length > 30) {
    return res.status(400).json({ success: false, error: '표시 이름은 1~30자로 입력해주세요.' });
  }

  const avatar = VALID_AVATARS.includes(req.body.avatar)
    ? req.body.avatar
    : current.avatar || 'obsidian';
  const statusMessage =
    req.body.statusMessage !== undefined
      ? String(req.body.statusMessage || '').trim().slice(0, 60)
      : current.status_message || '';
  const rawScore = req.body.targetScore !== undefined ? Number(req.body.targetScore) : current.target_score;
  const targetScore =
    Number.isFinite(rawScore) && rawScore >= 200 && rawScore <= 450
      ? Math.round(rawScore)
      : current.target_score || 385;
  const targetMajor =
    typeof req.body.targetMajor === 'string' && req.body.targetMajor.trim()
      ? req.body.targetMajor.trim().slice(0, 40)
      : current.target_major || '컴퓨터공학부';
  const targetUniversity =
    typeof req.body.targetUniversity === 'string' && req.body.targetUniversity.trim()
      ? req.body.targetUniversity.trim().slice(0, 40)
      : current.target_university || '성균관대학교';
  const examTrack = VALID_CATEGORIES.includes(req.body.examTrack)
    ? req.body.examTrack
    : current.exam_track || '자연';

  try {
    stmts.updateUserProfile.run(
      displayName,
      avatar,
      statusMessage,
      targetScore,
      targetMajor,
      targetUniversity,
      examTrack,
      req.userId
    );
    const updated = stmts.findUserById.get(req.userId);
    const countRow = stmts.countConsultationsByUser.get(req.userId);
    res.json({ success: true, user: serializeUser(updated, countRow ? countRow.count : 0) });
  } catch (e) {
    console.error('프로필 업데이트 오류:', e);
    res.status(500).json({ success: false, error: '프로필 저장 중 오류가 발생했습니다.' });
  }
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

  const user = stmts.findUserWithPasswordById.get(req.userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ success: false, error: '현재 비밀번호가 일치하지 않습니다.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  stmts.updateUserPassword.run(newHash, req.userId);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// 입시 성적 분석 API (비로그인 즉시 체험 + 로그인 시 자동 저장)
// ═══════════════════════════════════════════════════════════════

app.post('/api/consult', optionalAuth, (req, res) => {
  const { score, major, category, englishGrade, subjects = null, save = true } = req.body || {};

  const scoreStr = String(score ?? '').trim();
  if (!scoreStr || !/^\d+(\.\d+)?$/.test(scoreStr)) {
    return res.status(400).json({
      success: false,
      error: '수능 표준점수 합을 숫자로 입력해주세요.',
    });
  }

  const scoreNum = Math.round(Number(scoreStr));
  if (!Number.isFinite(scoreNum) || scoreNum < 200 || scoreNum > 450) {
    return res.status(400).json({
      success: false,
      error: '유효한 표준점수 합(200~450점)을 입력해주세요.',
    });
  }

  const cleanMajor = typeof major === 'string' ? major.trim() : '';
  if (!cleanMajor || cleanMajor.length > 60) {
    return res.status(400).json({
      success: false,
      error: '희망 학과를 1~60자 이내로 입력해주세요.',
    });
  }

  const categoryOverride = VALID_CATEGORIES.includes(category) ? category : null;
  const parsedEnglish = englishGrade !== undefined ? Number(englishGrade) : 1;
  const safeEnglishGrade = Number.isInteger(parsedEnglish) && parsedEnglish >= 1 && parsedEnglish <= 5
    ? parsedEnglish
    : 1;

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
    try {
      const result = stmts.createConsultation.run(
        req.userId,
        scoreNum,
        cleanMajor,
        analysis.meta.category,
        analysis.meta.level,
        analysis.markdown,
        JSON.stringify(analysis.meta)
      );
      consultationId = Number(result.lastInsertRowid);
      saved = true;
    } catch (e) {
      console.error('분석 기록 저장 오류:', e);
    }
  }

  res.json({
    success: true,
    consultationId,
    saved,
    ...analysis,
  });
});

// ═══════════════════════════════════════════════════════════════
// 분석 내역 조회 및 삭제 API
// ═══════════════════════════════════════════════════════════════

app.get('/api/consultations', authMiddleware, (req, res) => {
  const rows = stmts.getConsultationsByUser.all(req.userId);
  const consultations = rows.map((row) => {
    const meta = safeParseJson(row.result_meta, {});
    return {
      id: row.id,
      score: row.score,
      major: row.major,
      category: row.category,
      level: row.level,
      reachCount: meta.reachCount ?? null,
      targetCount: meta.targetCount ?? null,
      safetyCount: meta.safetyCount ?? null,
      englishGrade: meta.englishGrade ?? 1,
      created_at: row.created_at,
    };
  });

  res.json({ success: true, consultations });
});

app.get('/api/consultations/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: '유효하지 않은 내역 ID입니다.' });
  }

  const row = stmts.getConsultationByIdAndUser.get(id, req.userId);
  if (!row) {
    return res.status(404).json({ success: false, error: '분석 내역을 찾을 수 없습니다.' });
  }

  const savedMeta = safeParseJson(row.result_meta, {});
  const hydrated = analyzeAdmission({
    score: row.score,
    major: row.major,
    categoryOverride: VALID_CATEGORIES.includes(row.category) ? row.category : null,
    englishGrade: savedMeta.englishGrade || 1,
    subjects: savedMeta.subjectProfile || null,
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
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: '유효하지 않은 내역 ID입니다.' });
  }

  const result = stmts.deleteConsultationByIdAndUser.run(id, req.userId);
  if (result.changes === 0) {
    return res.status(404).json({ success: false, error: '삭제할 분석 내역을 찾을 수 없습니다.' });
  }

  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// 관심 대학 (북마크) API
// ═══════════════════════════════════════════════════════════════

app.get('/api/bookmarks', authMiddleware, (req, res) => {
  const rows = stmts.getBookmarksByUser.all(req.userId);
  const bookmarks = rows
    .map((row) => {
      const uni = universityData.find((u) => u.id === row.university_id);
      if (!uni) return null;
      return {
        universityId: row.university_id,
        department: row.department || '',
        createdAt: row.created_at,
        university: uni,
      };
    })
    .filter(Boolean);

  res.json({ success: true, bookmarks });
});

app.post('/api/bookmarks', authMiddleware, (req, res) => {
  const universityId = typeof req.body?.universityId === 'string' ? req.body.universityId.trim() : '';
  const department = typeof req.body?.department === 'string' ? req.body.department.trim().slice(0, 60) : '';

  const uni = universityData.find((u) => u.id === universityId);
  if (!uni) {
    return res.status(404).json({ success: false, error: '존재하지 않는 대학입니다.' });
  }

  stmts.upsertBookmark.run(req.userId, universityId, department);
  res.status(201).json({
    success: true,
    bookmark: { universityId, department, university: uni },
  });
});

app.delete('/api/bookmarks/:universityId', authMiddleware, (req, res) => {
  const universityId = String(req.params.universityId || '').trim();
  if (!universityId) {
    return res.status(400).json({ success: false, error: '유효하지 않은 대학 ID입니다.' });
  }

  stmts.deleteBookmark.run(req.userId, universityId);
  res.json({ success: true });
});

// API 404 핸들러
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: '요청한 API 경로를 찾을 수 없습니다.' });
});

// SPA 폴백 (브라우저 라우팅 지원)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// JSON 파싱 오류 및 일반 에러 핸들러
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: '잘못된 JSON 요청 형식입니다.' });
  }
  console.error('서버 내부 오류:', err);
  res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
});

// ═══════════════════════════════════════════════════════════════
// 서버 실행
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`UniPick 서버가 http://localhost:${PORT} 에서 실행 중입니다. (정적 경로: ${path.basename(staticDir)})`);
  });
}

module.exports = { app, server };
