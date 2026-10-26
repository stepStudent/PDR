// Traffic Rules Exam Engine

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'danger' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let examState = {
  sessionId: null,
  questions: [],
  currentIndex: 0,
  answers: {}, // { [questionNumber]: selectedIndex }
  totalQuestions: 20,
  timeRemaining: 1200, // 20 minutes in seconds
  elapsedSeconds: 0,
  timerInterval: null,
  isFinished: false,
  currentUser: null
};

// Start the exam flow
async function initExam() {
  try {
    const sessionRes = await fetch('/api/auth/me');
    const sessionData = await sessionRes.json();
    if (!sessionData.authenticated || sessionData.role !== 'user') {
      window.location.href = '/';
      return;
    }

    examState.currentUser = sessionData.user;
    document.getElementById('exam-student-name').textContent = examState.currentUser.surname;
    document.getElementById('exam-student-group').textContent = examState.currentUser.groupName || 'Група';
    document.getElementById('avatar-initials').textContent = (examState.currentUser.surname || 'К')[0].toUpperCase();

    // Request new 20-question randomized session from backend
    const startRes = await fetch('/api/exam/start', { method: 'POST' });
    if (!startRes.ok) {
      const err = await startRes.json();
      throw new Error(err.error || 'Помилка запуску іспиту');
    }

    const examData = await startRes.json();
    examState.sessionId = examData.sessionId;
    examState.questions = examData.questions;
    examState.totalQuestions = examData.questions.length;
    examState.timeRemaining = examData.durationLimitSec || 1200;

    buildQuestionGrid();
    renderQuestion(0);
    startTimer();
  } catch (err) {
    showToast('Не вдалося ініціалізувати іспит: ' + err.message, 'danger');
    setTimeout(() => {
      window.location.href = '/user';
    }, 2500);
  }
}

// Build 1..20 Grid
function buildQuestionGrid() {
  const grid = document.getElementById('question-nav-grid');
  grid.innerHTML = '';

  for (let i = 0; i < examState.totalQuestions; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qg-btn' + (i === 0 ? ' active' : '');
    btn.id = `qg-btn-${i}`;
    btn.textContent = i + 1;
    btn.onclick = () => goToQuestion(i);
    grid.appendChild(btn);
  }
}

// Render specific question
function renderQuestion(index) {
  if (index < 0 || index >= examState.totalQuestions) return;
  examState.currentIndex = index;

  const q = examState.questions[index];
  const qNum = q.questionNumber;

  // Update Grid Buttons
  document.querySelectorAll('.qg-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === index);
  });

  // Top indicators
  document.getElementById('q-section-badge').textContent = q.sectionName || 'ПРАВИЛА ДОРОЖНЬОГО РУХУ';
  document.getElementById('q-number-indicator').textContent = `Питання ${index + 1} з ${examState.totalQuestions}`;
  document.getElementById('q-text').textContent = q.text;

  // Handle Image
  const imgBox = document.getElementById('q-image-container');
  const imgElem = document.getElementById('q-image');
  const bodyContainer = document.getElementById('q-body-container');

  if (q.image) {
    imgElem.src = q.image;
    imgBox.style.display = 'block';
    bodyContainer.classList.add('has-image');
  } else {
    imgElem.src = '';
    imgBox.style.display = 'none';
    bodyContainer.classList.remove('has-image');
  }

  // Render Options
  const optionsList = document.getElementById('q-options-container');
  optionsList.innerHTML = '';

  const currentAnswer = examState.answers[qNum];

  q.options.forEach((optText, optIdx) => {
    const item = document.createElement('div');
    const isSelected = currentAnswer === optIdx;
    item.className = 'option-item' + (isSelected ? ' selected' : '');
    item.onclick = () => selectOption(qNum, optIdx);

    item.innerHTML = `
      <div class="option-num-badge">${optIdx + 1}</div>
      <div class="option-radio"></div>
      <div class="option-text">${optText}</div>
    `;
    optionsList.appendChild(item);
  });

  // Controls buttons state
  document.getElementById('btn-prev-q').disabled = index === 0;
  const nextBtn = document.getElementById('btn-next-q');
  if (index === examState.totalQuestions - 1) {
    nextBtn.textContent = 'Останнє питання 🏁';
  } else {
    nextBtn.textContent = 'Наступне питання →';
  }

  updateProgressStats();
}

// Select an option for a question
function selectOption(qNum, optIdx) {
  if (examState.isFinished) return;

  examState.answers[qNum] = optIdx;

  // Highlight option item
  const items = document.querySelectorAll('.option-item');
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === optIdx);
  });

  // Mark in grid as answered
  const qBtn = document.getElementById(`qg-btn-${examState.currentIndex}`);
  if (qBtn) {
    qBtn.classList.add('answered');
  }

  updateProgressStats();
}

function updateProgressStats() {
  const answeredCount = Object.keys(examState.answers).length;
  document.getElementById('stat-answered').textContent = answeredCount;
  document.getElementById('stat-remaining').textContent = examState.totalQuestions - answeredCount;
}

function goToQuestion(idx) {
  renderQuestion(idx);
}

function goToPrevQuestion() {
  if (examState.currentIndex > 0) {
    renderQuestion(examState.currentIndex - 1);
  }
}

function goToNextQuestion() {
  if (examState.currentIndex < examState.totalQuestions - 1) {
    renderQuestion(examState.currentIndex + 1);
  }
}

// Timer Countdown
function startTimer() {
  const timerDisplay = document.getElementById('timer-display');
  const timerBox = document.getElementById('exam-timer-box');

  function tick() {
    examState.elapsedSeconds++;
    examState.timeRemaining--;

    const minutes = Math.floor(examState.timeRemaining / 60);
    const seconds = examState.timeRemaining % 60;
    timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    // Color states
    if (examState.timeRemaining <= 60) {
      timerBox.className = 'exam-timer-box timer-danger';
    } else if (examState.timeRemaining <= 180) {
      timerBox.className = 'exam-timer-box timer-warning';
    } else {
      timerBox.className = 'exam-timer-box';
    }

    // Time expired
    if (examState.timeRemaining <= 0) {
      clearInterval(examState.timerInterval);
      showToast('Час іспиту вичерпано! Автоматична фіксація результатів...', 'warning');
      submitExamNow();
    }
  }

  examState.timerInterval = setInterval(tick, 1000);
}

// Finish confirmation modal
function promptFinishExam() {
  const answeredCount = Object.keys(examState.answers).length;
  const remaining = examState.totalQuestions - answeredCount;

  const warningElem = document.getElementById('unanswered-warning');
  const textElem = document.getElementById('finish-modal-text');

  if (remaining > 0) {
    warningElem.style.display = 'block';
    textElem.textContent = `Ви відповіли на ${answeredCount} з ${examState.totalQuestions} питань. Залишилось ${remaining} невідповіданих! Бажаєте завершити іспит прямо зараз?`;
  } else {
    warningElem.style.display = 'none';
    textElem.textContent = `Ви відповіли на всі 20 питань! Бажаєте надіслати іспит на остаточну перевірку та зберегти у базі даних?`;
  }

  document.getElementById('finish-modal').classList.add('active');
}

function closeFinishModal() {
  document.getElementById('finish-modal').classList.remove('active');
}

// Submit Exam to Backend
async function submitExamNow() {
  closeFinishModal();
  if (examState.isFinished) return;
  examState.isFinished = true;
  clearInterval(examState.timerInterval);

  showToast('Перевірка та збереження протоколу в базі даних...', 'info');

  try {
    const res = await fetch('/api/exam/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: examState.sessionId,
        answers: examState.answers,
        elapsedSeconds: examState.elapsedSeconds
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Помилка збереження результату');
    }

    renderResultView(data.result);
  } catch (err) {
    showToast('Помилка: ' + err.message, 'danger');
  }
}

// Render Grand Result Screen
async function renderResultView(result) {
  // Hide exam, show result
  document.getElementById('active-exam-view').style.display = 'none';
  const resultView = document.getElementById('result-view');
  resultView.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const banner = document.getElementById('result-banner');
  const icon = document.getElementById('result-icon');
  const title = document.getElementById('result-verdict-title');
  const desc = document.getElementById('result-verdict-desc');

  if (result.passed) {
    banner.className = 'result-card-banner passed';
    icon.textContent = '✓';
    title.textContent = 'ІСПИТ СКЛАДЕНО!';
    desc.textContent = 'Вітаємо! Ви успішно склали фінальний теоретичний іспит з Правил дорожнього руху України за офіційним стандартом сервісних центрів МВС.';
  } else {
    banner.className = 'result-card-banner failed';
    icon.textContent = '✕';
    title.textContent = 'ІСПИТ НЕ СКЛАДЕНО';
    desc.textContent = `На жаль, ви допустили ${result.wrongCount} помилок (дозволяється не більше 2). Рекомендуємо повторити проблемні розділи та скласти іспит повторно.`;
  }

  document.getElementById('metric-score').textContent = `${result.score} / ${result.totalQuestions}`;
  document.getElementById('metric-score').style.color = result.passed ? '#34d399' : '#f87171';
  document.getElementById('metric-mistakes').textContent = result.wrongCount;
  
  const m = Math.floor(result.durationSeconds / 60);
  const s = result.durationSeconds % 60;
  document.getElementById('metric-duration').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  
  document.getElementById('metric-hash').textContent = `SHA-256: ${result.checksumHash}`;

  // Fetch full detailed protocol for review
  loadReviewProtocol(result.resultId);
}

// Load full review breakdown
async function loadReviewProtocol(resultId) {
  const container = document.getElementById('answers-review-container');
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Завантаження детального розбору питань...</div>';

  try {
    const res = await fetch(`/api/user/results/${resultId}`);
    if (!res.ok) throw new Error('Не вдалося завантажити детальний протокол');
    const data = await res.json();

    container.innerHTML = data.answers.map(ans => `
      <div class="review-item ${ans.is_correct ? 'is-correct' : 'is-wrong'}">
        <div class="review-q-num">
          <span>Питання №${ans.question_number}</span>
          ${ans.is_correct 
            ? '<span class="badge badge-success">✓ Правильно</span>' 
            : '<span class="badge badge-danger">✗ Помилка</span>'}
          <span style="margin-left: auto; font-size: 0.75rem; color: var(--text-dim);">${ans.section_name || ''}</span>
        </div>

        <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 0.75rem;">
          ${ans.question_text}
        </div>

        ${ans.question_image ? `
          <div style="margin-bottom: 1rem; max-width: 480px; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border);">
            <img src="${ans.question_image}" alt="Ілюстрація" style="width: 100%; display: block;">
          </div>
        ` : ''}

        <div class="review-options">
          ${ans.options.map((opt, idx) => {
            let cls = 'review-opt';
            let label = '';
            if (idx === ans.correct_index) {
              cls += ' opt-correct';
              label = ' <strong style="color: #34d399;">(Правильна відповідь)</strong>';
            }
            if (idx === ans.selected_index && !ans.is_correct) {
              cls += ' opt-wrong-choice';
              label = ' <strong style="color: #f87171;">(Ваша відповідь)</strong>';
            } else if (idx === ans.selected_index && ans.is_correct) {
              label = ' <strong style="color: #34d399;">(Ваш вибір ✓)</strong>';
            }
            return `<div class="${cls}"><strong>${idx + 1}.</strong> ${opt} ${label}</div>`;
          }).join('')}
        </div>

        ${ans.explanation ? `
          <div class="review-explanation">
            <strong>💡 Офіційне пояснення ПДР:</strong> ${ans.explanation}
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 1.5rem;">${err.message}</div>`;
  }
}

function scrollToReview() {
  document.getElementById('result-review-section').scrollIntoView({ behavior: 'smooth' });
}

// Image Zoom helper
function zoomImage() {
  const currentQ = examState.questions[examState.currentIndex];
  if (!currentQ || !currentQ.image) return;
  document.getElementById('zoomed-image').src = currentQ.image;
  document.getElementById('image-modal').classList.add('active');
}

function closeImageModal() {
  document.getElementById('image-modal').classList.remove('active');
}

function confirmExit(e) {
  if (!examState.isFinished) {
    if (!confirm('Ви дійсно бажаєте вийти? Поточний прогрес іспиту буде втрачено!')) {
      e.preventDefault();
      return false;
    }
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  initExam();
});
