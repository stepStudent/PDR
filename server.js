const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const db = require('./db/database.js');
const {
  COOKIE_NAME,
  createToken,
  authMiddleware,
  requireAdmin,
  requireUser,
  requireAuth
} = require('./auth.js');
const {
  createExamSession,
  submitExam,
  getExamProtocol
} = require('./exam_service.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Body & Cookie Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// Authentication Endpoints
// -----------------------------------------------------------------------------

// Get list of groups for student login dropdown
app.get('/api/auth/groups', (req, res) => {
  try {
    const groups = db.prepare('SELECT id, name, description FROM groups ORDER BY name ASC').all();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання списку груп' });
  }
});

// Admin Login
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введіть логін та пароль' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
  if (!admin) {
    return res.status(401).json({ error: 'Невірний логін або пароль адміністратора' });
  }

  const isValid = bcrypt.compareSync(password, admin.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Невірний логін або пароль адміністратора' });
  }

  const token = createToken({
    role: 'admin',
    adminId: admin.id,
    username: admin.username
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    role: 'admin',
    user: { username: admin.username }
  });
});

// Student / User Login (Group + Surname + Password)
app.post('/api/auth/user-login', (req, res) => {
  const { groupId, surname, password } = req.body;
  if (!groupId || !surname || !password) {
    return res.status(400).json({ error: 'Оберіть групу та введіть прізвище і пароль' });
  }

  const trimmedSurname = surname.trim();
  const user = db.prepare(`
    SELECT u.*, g.name as group_name
    FROM users u
    JOIN groups g ON u.group_id = g.id
    WHERE u.group_id = ? AND LOWER(u.surname) = LOWER(?)
  `).get(groupId, trimmedSurname);

  if (!user) {
    return res.status(401).json({ error: 'Користувача з таким прізвищем у цій групі не знайдено' });
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Невірний пароль користувача' });
  }

  const token = createToken({
    role: 'user',
    userId: user.id,
    surname: user.surname,
    groupId: user.group_id,
    groupName: user.group_name
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    role: 'user',
    user: {
      id: user.id,
      surname: user.surname,
      groupId: user.group_id,
      groupName: user.group_name
    }
  });
});

// Current session status
app.get('/api/auth/me', (req, res) => {
  if (!req.session) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    role: req.session.role,
    user: req.session
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// Admin Endpoints
// -----------------------------------------------------------------------------

// Admin: Change Password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Заповніть поточний та новий пароль' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Новий пароль повинен містити не менше 4 символів' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  if (!admin) {
    return res.status(404).json({ error: 'Адміністратора не знайдено' });
  }

  const isValid = bcrypt.compareSync(currentPassword, admin.password_hash);
  if (!isValid) {
    return res.status(400).json({ error: 'Невірний поточний пароль' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newHash, admin.id);

  res.json({ success: true, message: 'Пароль адміністратора успішно змінено!' });
});

// Admin: Get all groups with statistics
app.get('/api/admin/groups', requireAdmin, (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT 
        g.id, g.name, g.description, g.created_at,
        COUNT(DISTINCT u.id) as student_count,
        COUNT(DISTINCT r.id) as exam_count,
        SUM(CASE WHEN r.passed = 1 THEN 1 ELSE 0 END) as passed_count
      FROM groups g
      LEFT JOIN users u ON g.id = u.group_id
      LEFT JOIN exam_results r ON u.id = r.user_id
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `).all();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження груп' });
  }
});

// Admin: Create Group
app.post('/api/admin/groups', requireAdmin, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Вкажіть назву групи' });
  }

  try {
    const stmt = db.prepare('INSERT INTO groups (name, description) VALUES (?, ?)');
    const info = stmt.run(name.trim(), (description || '').trim());
    res.json({ success: true, id: info.lastInsertRowid, name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Група з такою назвою вже існує' });
    }
    res.status(500).json({ error: 'Помилка збереження групи' });
  }
});

// Admin: Delete Group
app.delete('/api/admin/groups/:id', requireAdmin, (req, res) => {
  const groupId = req.params.id;
  try {
    // Check if any immutable exam results belong to this group's students
    const resultsCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM exam_results r
      JOIN users u ON r.user_id = u.id
      WHERE u.group_id = ?
    `).get(groupId).cnt;

    if (resultsCount > 0) {
      return res.status(400).json({
        error: 'Неможливо видалити групу, оскільки студенти цієї групи вже склали офіційні іспити з фіксацією протоколів у базі даних!'
      });
    }

    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Помилка видалення групи: ' + err.message });
  }
});

// Admin: Get students in group
app.get('/api/admin/groups/:id/students', requireAdmin, (req, res) => {
  try {
    const students = db.prepare(`
      SELECT 
        u.id, u.surname, u.raw_password, u.created_at,
        COUNT(r.id) as attempts_count,
        MAX(r.passed) as has_passed,
        MAX(r.score) as best_score
      FROM users u
      LEFT JOIN exam_results r ON u.id = r.user_id
      WHERE u.group_id = ?
      GROUP BY u.id
      ORDER BY u.surname ASC
    `).all(req.params.id);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження студентів' });
  }
});

// Admin: Add Single Student
app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { groupId, surname, password } = req.body;
  if (!groupId || !surname || !surname.trim()) {
    return res.status(400).json({ error: 'Вкажіть групу та прізвище студента' });
  }

  // Generate a random 6-character memorable password if not provided
  const studentPass = (password && password.trim()) || ('pdr' + Math.floor(100 + Math.random() * 900));
  const passHash = bcrypt.hashSync(studentPass, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (group_id, surname, password_hash, raw_password) VALUES (?, ?, ?, ?)');
    const info = stmt.run(groupId, surname.trim(), passHash, studentPass);
    res.json({
      success: true,
      id: info.lastInsertRowid,
      surname: surname.trim(),
      password: studentPass
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Студент з таким прізвищем вже є у цій групі' });
    }
    res.status(500).json({ error: 'Помилка додавання студента' });
  }
});

// Admin: Batch Add Students (Paste list of surnames)
app.post('/api/admin/students/batch', requireAdmin, (req, res) => {
  const { groupId, surnamesText } = req.body;
  if (!groupId || !surnamesText) {
    return res.status(400).json({ error: 'Вкажіть групу та список прізвищ' });
  }

  const lines = surnamesText
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (lines.length === 0) {
    return res.status(400).json({ error: 'Список прізвищ порожній' });
  }

  const added = [];
  const errors = [];

  const stmt = db.prepare('INSERT INTO users (group_id, surname, password_hash, raw_password) VALUES (?, ?, ?, ?)');

  for (const surname of lines) {
    const studentPass = 'pdr' + Math.floor(100 + Math.random() * 900);
    const passHash = bcrypt.hashSync(studentPass, 10);
    try {
      const info = stmt.run(groupId, surname, passHash, studentPass);
      added.push({ id: info.lastInsertRowid, surname, password: studentPass });
    } catch (err) {
      errors.push({ surname, error: err.message.includes('UNIQUE') ? 'Вже існує у групі' : err.message });
    }
  }

  res.json({ success: true, added, errors });
});

// Admin: Delete student (only if no exam taken)
app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const studentId = req.params.id;
  try {
    const examCheck = db.prepare('SELECT COUNT(*) as cnt FROM exam_results WHERE user_id = ?').get(studentId);
    if (examCheck.cnt > 0) {
      return res.status(400).json({
        error: 'Неможливо видалити користувача, оскільки його результати іспиту вже зафіксовані в базі даних як офіційний протокол!'
      });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Помилка видалення студента' });
  }
});

// Admin: Get all exam results (with search and filters)
app.get('/api/admin/results', requireAdmin, (req, res) => {
  const { groupId, search, status } = req.query;

  let sql = `
    SELECT 
      r.id, r.session_id, r.user_id, r.student_surname, r.group_name,
      r.score, r.total_questions, r.wrong_count, r.passed,
      r.duration_seconds, r.completed_at, r.checksum_hash, r.is_locked,
      u.group_id
    FROM exam_results r
    JOIN users u ON r.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (groupId && groupId !== 'all') {
    sql += ' AND u.group_id = ?';
    params.push(groupId);
  }

  if (search && search.trim()) {
    sql += ' AND LOWER(r.student_surname) LIKE ?';
    params.push(`%${search.trim().toLowerCase()}%`);
  }

  if (status === 'passed') {
    sql += ' AND r.passed = 1';
  } else if (status === 'failed') {
    sql += ' AND r.passed = 0';
  }

  sql += ' ORDER BY r.completed_at DESC';

  try {
    const results = db.prepare(sql).all(...params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження результатів' });
  }
});

// Admin: Get detailed exam protocol for ANY user
app.get('/api/admin/results/:id', requireAdmin, (req, res) => {
  try {
    const protocol = getExamProtocol(req.params.id);
    if (!protocol) {
      return res.status(404).json({ error: 'Протокол іспиту не знайдено' });
    }
    res.json(protocol);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження протоколу: ' + err.message });
  }
});

// Admin: General analytics and statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const totalExams = db.prepare('SELECT COUNT(*) as cnt FROM exam_results').get().cnt;
    const passedExams = db.prepare('SELECT COUNT(*) as cnt FROM exam_results WHERE passed = 1').get().cnt;
    const totalStudents = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const totalGroups = db.prepare('SELECT COUNT(*) as cnt FROM groups').get().cnt;
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM exam_results').get().avg || 0;

    const recentResults = db.prepare(`
      SELECT student_surname, group_name, score, passed, completed_at
      FROM exam_results
      ORDER BY completed_at DESC
      LIMIT 5
    `).all();

    res.json({
      totalExams,
      passedExams,
      failedExams: totalExams - passedExams,
      passRate: totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0,
      totalStudents,
      totalGroups,
      avgScore: Number(avgScore).toFixed(1),
      recentResults
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження статистики' });
  }
});

// -----------------------------------------------------------------------------
// Candidate / User Endpoints
// -----------------------------------------------------------------------------

// Start new exam session
app.post('/api/exam/start', requireUser, (req, res) => {
  try {
    const session = createExamSession(req.session.userId);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Не вдалося створити сесію іспиту: ' + err.message });
  }
});

// Submit completed exam
app.post('/api/exam/submit', requireUser, (req, res) => {
  const { sessionId, answers, elapsedSeconds } = req.body;
  if (!sessionId || !answers) {
    return res.status(400).json({ error: 'Відсутні обов’язкові дані іспиту' });
  }

  try {
    const result = submitExam(sessionId, req.session.userId, answers, elapsedSeconds);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Candidate: Get ONLY their own exam results
app.get('/api/user/results', requireUser, (req, res) => {
  try {
    const results = db.prepare(`
      SELECT 
        id, session_id, student_surname, group_name,
        score, total_questions, wrong_count, passed,
        duration_seconds, completed_at, checksum_hash, is_locked
      FROM exam_results
      WHERE user_id = ?
      ORDER BY completed_at DESC
    `).all(req.session.userId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання результатів' });
  }
});

// Candidate: Get full detailed protocol for THEIR OWN exam only
app.get('/api/user/results/:id', requireUser, (req, res) => {
  try {
    const protocol = getExamProtocol(req.params.id);
    if (!protocol) {
      return res.status(404).json({ error: 'Протокол не знайдено' });
    }

    // STRICT ACCESS CONTROL: candidate can ONLY view their own protocol!
    if (protocol.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Доступ заборонено: ви можете переглядати лише власні результати іспиту!' });
    }

    res.json(protocol);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання протоколу: ' + err.message });
  }
});

// -----------------------------------------------------------------------------
// HTML Page Routes
// -----------------------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/exam', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚗 Вебзастосунок "Екзамен ПДР України" успішно запущено!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`👤 Вхід кандидата: прізвище та пароль (наприклад Коваленко / pass123)`);
  console.log(`🔑 Вхід адміністратора: admin / admin`);
  console.log(`====================================================`);
});
