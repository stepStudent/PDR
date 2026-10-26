const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'pdr_exam.db');
const db = new Database(dbPath);

// Enable WAL mode and foreign keys for performance and reliability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database tables
function initDb() {
  db.exec(`
    -- Administrator table
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Groups created by admin for exams
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Students / Candidates created by admin
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      surname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      raw_password TEXT NOT NULL, -- kept for admin reference to print credentials cards
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, surname)
    );

    -- Active exam sessions
    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      questions_json TEXT NOT NULL,
      duration_limit_sec INTEGER DEFAULT 1200,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_completed INTEGER DEFAULT 0
    );

    -- Completed exam results (IMMUTABLE, PROTECTED)
    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      student_surname TEXT NOT NULL,
      group_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL DEFAULT 20,
      wrong_count INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checksum_hash TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 1
    );

    -- Individual answers for each exam question (IMMUTABLE, PROTECTED)
    CREATE TABLE IF NOT EXISTS exam_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_result_id INTEGER NOT NULL REFERENCES exam_results(id) ON DELETE RESTRICT,
      question_number INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      section_name TEXT,
      question_text TEXT NOT NULL,
      question_image TEXT,
      options_json TEXT NOT NULL,
      selected_index INTEGER,
      correct_index INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      explanation TEXT
    );

    -- Triggers to strictly forbid UPDATE or DELETE on exam_results
    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_results_update
    BEFORE UPDATE ON exam_results
    BEGIN
      SELECT RAISE(ABORT, 'Помилка безпеки: Результати іспиту захищені від редагування та модифікації!');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_results_delete
    BEFORE DELETE ON exam_results
    BEGIN
      SELECT RAISE(ABORT, 'Помилка безпеки: Результати іспиту є офіційним протоколом і захищені від видалення!');
    END;

    -- Triggers to strictly forbid UPDATE or DELETE on exam_answers
    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_answers_update
    BEFORE UPDATE ON exam_answers
    BEGIN
      SELECT RAISE(ABORT, 'Помилка безпеки: Відповіді іспиту захищені від редагування!');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_prevent_exam_answers_delete
    BEFORE DELETE ON exam_answers
    BEGIN
      SELECT RAISE(ABORT, 'Помилка безпеки: Відповіді іспиту захищені від видалення!');
    END;
  `);

  // Seed default admin (login: admin, password: admin) if not exists
  const adminCheck = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!adminCheck) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin', salt);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log('Default administrator account created: admin / admin');
  }

  // Seed sample group and sample students if no groups exist yet
  const groupCount = db.prepare('SELECT COUNT(*) as cnt FROM groups').get().cnt;
  if (groupCount === 0) {
    const groupStmt = db.prepare('INSERT INTO groups (name, description) VALUES (?, ?)');
    const g1 = groupStmt.run('Група 24-А (Категорія B)', 'Ранкова група водіїв автошколи');
    const g2 = groupStmt.run('Група 24-Б (Категорія B)', 'Вечірня група водіїв автошколи');

    const userStmt = db.prepare('INSERT INTO users (group_id, surname, password_hash, raw_password) VALUES (?, ?, ?, ?)');
    
    const sampleStudents = [
      { groupId: g1.lastInsertRowid, surname: 'Коваленко', pass: 'pass123' },
      { groupId: g1.lastInsertRowid, surname: 'Мельник', pass: 'melnyk77' },
      { groupId: g1.lastInsertRowid, surname: 'Шевченко', pass: 'sheva2026' },
      { groupId: g2.lastInsertRowid, surname: 'Бондаренко', pass: 'bonda88' },
      { groupId: g2.lastInsertRowid, surname: 'Ткаченко', pass: 'tkach321' }
    ];

    for (const s of sampleStudents) {
      const hash = bcrypt.hashSync(s.pass, 10);
      userStmt.run(s.groupId, s.surname, hash, s.pass);
    }
    console.log('Sample groups and students initialized for testing');
  }
}

initDb();

module.exports = db;
