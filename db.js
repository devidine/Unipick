// db.js — SQLite 데이터베이스 초기화 및 Prepared Statements
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.UNIPICK_DB_PATH || path.join(__dirname, 'unipick.db');
const db = new Database(dbPath);

// WAL 모드 및 외래키 제약 활성화
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 기존 스키마 유지 + 관심 대학(saved_universities) 테이블 비파괴적 초기화
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar TEXT DEFAULT '',
    status_message TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    score INTEGER NOT NULL,
    major TEXT NOT NULL,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    result_markdown TEXT NOT NULL,
    result_meta TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_universities (
    user_id INTEGER NOT NULL,
    university_id TEXT NOT NULL,
    department TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, university_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_consultations_user ON consultations(user_id);
  CREATE INDEX IF NOT EXISTS idx_saved_universities_user ON saved_universities(user_id);
`);

const stmts = {
  // Users
  createUser: db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ),
  findUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById: db.prepare(
    'SELECT id, username, display_name, created_at FROM users WHERE id = ?'
  ),
  updateUserDisplayName: db.prepare(
    'UPDATE users SET display_name = ? WHERE id = ?'
  ),

  // Consultations
  createConsultation: db.prepare(
    'INSERT INTO consultations (user_id, score, major, category, level, result_markdown, result_meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  getConsultationsByUser: db.prepare(
    'SELECT id, score, major, category, level, result_meta, created_at FROM consultations WHERE user_id = ? ORDER BY created_at DESC, id DESC'
  ),
  getConsultationByIdAndUser: db.prepare(
    'SELECT * FROM consultations WHERE id = ? AND user_id = ?'
  ),
  deleteConsultationByIdAndUser: db.prepare(
    'DELETE FROM consultations WHERE id = ? AND user_id = ?'
  ),
  countConsultationsByUser: db.prepare(
    'SELECT COUNT(*) as count FROM consultations WHERE user_id = ?'
  ),

  // Bookmarks (관심 대학)
  getBookmarksByUser: db.prepare(
    'SELECT university_id, department, created_at FROM saved_universities WHERE user_id = ? ORDER BY created_at DESC'
  ),
  upsertBookmark: db.prepare(
    'INSERT INTO saved_universities (user_id, university_id, department) VALUES (?, ?, ?) ON CONFLICT(user_id, university_id) DO UPDATE SET department = excluded.department, created_at = CURRENT_TIMESTAMP'
  ),
  deleteBookmark: db.prepare(
    'DELETE FROM saved_universities WHERE user_id = ? AND university_id = ?'
  ),
};

module.exports = { db, stmts };
