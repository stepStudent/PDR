const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db/database.js');

const questionsFile = path.join(__dirname, 'data', 'questions.json');
let allQuestions = [];
let questionsWithImages = [];
let questionsWithoutImages = [];

try {
  const rawData = fs.readFileSync(questionsFile, 'utf-8');
  const parsed = JSON.parse(rawData);
  allQuestions = parsed.questions || [];
  questionsWithImages = allQuestions.filter(q => q.image && typeof q.image === 'string');
  questionsWithoutImages = allQuestions.filter(q => !q.image);
  console.log(`Loaded ${allQuestions.length} official PDR questions (${questionsWithImages.length} with road images).`);
} catch (err) {
  console.error('Failed to load questions.json:', err);
}

// Generate 20 official exam questions
// Standard official test: ~8-10 visual situational questions with illustrations (signs, crossroads, signals)
// and 10-12 conceptual/rules/safety questions.
function generateExamQuestions() {
  const selected = [];
  const selectedIds = new Set();

  function getRandom(arr, count) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    const res = [];
    for (const item of shuffled) {
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        res.push(item);
        if (res.length === count) break;
      }
    }
    return res;
  }

  // Draw 9 questions with road illustrations (intersections, signs, lane rules)
  const visualQuestions = getRandom(questionsWithImages, 9);
  selected.push(...visualQuestions);

  // Draw 11 questions from the rest of the rule bank
  const ruleQuestions = getRandom(questionsWithoutImages, 20 - selected.length);
  selected.push(...ruleQuestions);

  // If still less than 20 for any reason, fill from any remaining
  if (selected.length < 20) {
    const extra = getRandom(allQuestions, 20 - selected.length);
    selected.push(...extra);
  }

  // Final shuffle of the 20 selected questions
  return selected.sort(() => 0.5 - Math.random()).map((q, idx) => ({
    questionNumber: idx + 1,
    id: q.id,
    sectionName: q.sectionName || 'Правила дорожнього руху',
    text: q.text,
    image: q.image ? (q.image.startsWith('images/') ? q.image.replace('images/', '/images/') : `/images/${q.image}`) : null,
    options: q.options || [],
    correctIndex: q.correctIndex,
    explanation: q.explanation || ''
  }));
}

// Create new exam session in DB
function createExamSession(userId) {
  const sessionId = 'exam_' + crypto.randomBytes(16).toString('hex');
  const questions = generateExamQuestions();

  const insertStmt = db.prepare(`
    INSERT INTO exam_sessions (id, user_id, questions_json, duration_limit_sec, is_completed)
    VALUES (?, ?, ?, 1200, 0)
  `);
  insertStmt.run(sessionId, userId, JSON.stringify(questions));

  // Client questions payload (without correctIndex to prevent cheating)
  const clientQuestions = questions.map(q => ({
    questionNumber: q.questionNumber,
    id: q.id,
    sectionName: q.sectionName,
    text: q.text,
    image: q.image,
    options: q.options
  }));

  return {
    sessionId,
    durationLimitSec: 1200,
    totalQuestions: questions.length,
    questions: clientQuestions
  };
}

// Submit and grade exam
function submitExam(sessionId, userId, studentAnswers, elapsedSeconds) {
  // Check if session exists and is active
  const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    throw new Error('Сесію іспиту не знайдено');
  }

  if (session.user_id !== userId) {
    throw new Error('Недійсний користувач для цієї сесії');
  }

  if (session.is_completed === 1) {
    throw new Error('Цей іспит уже завершено і результати збережено! Повторне надсилання неможливе.');
  }

  const user = db.prepare(`
    SELECT u.id, u.surname, g.name as group_name
    FROM users u
    JOIN groups g ON u.group_id = g.id
    WHERE u.id = ?
  `).get(userId);

  if (!user) {
    throw new Error('Користувача не знайдено');
  }

  const questions = JSON.parse(session.questions_json);
  let score = 0;
  let wrongCount = 0;
  const detailedAnswers = [];

  questions.forEach(q => {
    const selected = studentAnswers[q.questionNumber];
    const hasAnswered = selected !== undefined && selected !== null;
    const isCorrect = hasAnswered && Number(selected) === q.correctIndex;

    if (isCorrect) {
      score++;
    } else {
      wrongCount++;
    }

    detailedAnswers.push({
      questionNumber: q.questionNumber,
      questionId: q.id,
      sectionName: q.sectionName,
      questionText: q.text,
      questionImage: q.image,
      optionsJson: JSON.stringify(q.options),
      selectedIndex: hasAnswered ? Number(selected) : null,
      correctIndex: q.correctIndex,
      isCorrect: isCorrect ? 1 : 0,
      explanation: q.explanation
    });
  });

  const passed = wrongCount <= 2 ? 1 : 0;
  const duration = Math.min(Math.max(elapsedSeconds || 0, 1), 1200);
  const completedAt = new Date().toISOString();

  // Cryptographic checksum hash for data integrity guarantee
  const hashPayload = `${sessionId}:${userId}:${score}:${wrongCount}:${passed}:${completedAt}:${JSON.stringify(studentAnswers)}`;
  const checksumHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

  // Insert result atomically with transaction
  const insertTransaction = db.transaction(() => {
    const resStmt = db.prepare(`
      INSERT INTO exam_results (
        session_id, user_id, student_surname, group_name,
        score, total_questions, wrong_count, passed,
        duration_seconds, completed_at, checksum_hash, is_locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const result = resStmt.run(
      sessionId,
      userId,
      user.surname,
      user.group_name,
      score,
      questions.length,
      wrongCount,
      passed,
      duration,
      completedAt,
      checksumHash
    );

    const examResultId = result.lastInsertRowid;

    const ansStmt = db.prepare(`
      INSERT INTO exam_answers (
        exam_result_id, question_number, question_id, section_name,
        question_text, question_image, options_json, selected_index,
        correct_index, is_correct, explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ans of detailedAnswers) {
      ansStmt.run(
        examResultId,
        ans.questionNumber,
        ans.questionId,
        ans.sectionName,
        ans.questionText,
        ans.questionImage,
        ans.optionsJson,
        ans.selectedIndex,
        ans.correctIndex,
        ans.isCorrect,
        ans.explanation
      );
    }

    // Mark session completed
    db.prepare('UPDATE exam_sessions SET is_completed = 1 WHERE id = ?').run(sessionId);

    return examResultId;
  });

  const examResultId = insertTransaction();

  return {
    resultId: examResultId,
    studentSurname: user.surname,
    groupName: user.group_name,
    score,
    totalQuestions: questions.length,
    wrongCount,
    passed: Boolean(passed),
    durationSeconds: duration,
    completedAt,
    checksumHash
  };
}

// Get full exam protocol by resultId
function getExamProtocol(resultId) {
  const result = db.prepare(`
    SELECT * FROM exam_results WHERE id = ?
  `).get(resultId);

  if (!result) return null;

  const answers = db.prepare(`
    SELECT * FROM exam_answers WHERE exam_result_id = ? ORDER BY question_number ASC
  `).all(resultId);

  const formattedAnswers = answers.map(a => ({
    ...a,
    options: JSON.parse(a.options_json)
  }));

  return {
    ...result,
    answers: formattedAnswers
  };
}

module.exports = {
  createExamSession,
  submitExam,
  getExamProtocol
};
