// User Cabinet Controller

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

let currentUser = null;

async function checkUserSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || data.role !== 'user') {
      window.location.href = '/';
      return;
    }
    currentUser = data.user;
    document.getElementById('user-display-name').textContent = currentUser.surname;
    document.getElementById('user-display-group').textContent = currentUser.groupName || 'Група';
    loadUserResults();
  } catch (err) {
    window.location.href = '/';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function startExam() {
  window.location.href = '/exam';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} хв ${s < 10 ? '0' : ''}${s} с`;
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadUserResults() {
  const tbody = document.getElementById('user-results-tbody');
  try {
    const res = await fetch('/api/user/results');
    if (!res.ok) throw new Error('Помилка завантаження результатів');
    const results = await res.json();

    if (results.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            Ви ще не складали іспит. Натисніть кнопку вище, щоб розпочати першу спробу!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = results.map(r => `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td>${formatDate(r.completed_at)}</td>
        <td>
          <span style="font-size: 1.125rem; font-weight: 700; color: ${r.passed ? '#34d399' : '#f87171'};">
            ${r.score} / ${r.total_questions}
          </span>
        </td>
        <td>
          <span style="color: ${r.wrong_count <= 2 ? 'var(--text-muted)' : '#f87171'}; font-weight: 600;">
            ${r.wrong_count}
          </span>
        </td>
        <td>${formatDuration(r.duration_seconds)}</td>
        <td>
          ${r.passed 
            ? '<span class="badge badge-success">🟢 СКЛАДЕНО</span>' 
            : '<span class="badge badge-danger">🔴 НЕ СКЛАДЕНО</span>'}
        </td>
        <td>
          <span class="badge badge-locked" title="SHA-256: ${r.checksum_hash}">
            🔒 Зафіксовано
          </span>
        </td>
        <td>
          <button onclick="viewProtocol(${r.id})" class="btn btn-outline btn-sm">
            Протокол 📋
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--danger); padding: 1.5rem;">
          ${err.message}
        </td>
      </tr>
    `;
  }
}

async function viewProtocol(resultId) {
  const modal = document.getElementById('protocol-modal');
  const body = document.getElementById('proto-modal-body');
  const subtitle = document.getElementById('proto-modal-subtitle');
  const seal = document.getElementById('proto-modal-seal');

  body.innerHTML = '<div style="text-align: center; padding: 2rem;">Завантаження протоколу...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`/api/user/results/${resultId}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Не вдалося завантажити протокол');
    }
    const data = await res.json();

    subtitle.textContent = `Кандидат: ${data.student_surname} (${data.group_name}) • Дата: ${formatDate(data.completed_at)} • Час: ${formatDuration(data.duration_seconds)}`;
    seal.textContent = `🔒 Цифровий підпис SHA-256: ${data.checksum_hash.substring(0, 16)}... (Захищено від змін)`;

    body.innerHTML = `
      <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Результат</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${data.passed ? '#34d399' : '#f87171'};">
            ${data.score} / ${data.total_questions}
          </div>
        </div>
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Помилок</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${data.wrong_count <= 2 ? '#34d399' : '#f87171'};">
            ${data.wrong_count}
          </div>
        </div>
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Рішення комісії</div>
          <div style="font-size: 1.125rem; font-weight: 800; margin-top: 4px;">
            ${data.passed ? '<span class="badge badge-success">СКЛАДЕНО</span>' : '<span class="badge badge-danger">НЕ СКЛАДЕНО</span>'}
          </div>
        </div>
      </div>

      <h3 style="margin-bottom: 1rem;">Розбір відповідей по кожному питанню:</h3>
      <div class="review-list">
        ${data.answers.map(ans => `
          <div class="review-item ${ans.is_correct ? 'is-correct' : 'is-wrong'}">
            <div class="review-q-num">
              <span>Питання №${ans.question_number}</span>
              ${ans.is_correct 
                ? '<span class="badge badge-success">✓ Правильно</span>' 
                : '<span class="badge badge-danger">✗ Помилка</span>'}
              <span style="margin-left: auto; font-size: 0.75rem; color: var(--text-dim);">${ans.section_name || ''}</span>
            </div>

            <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.75rem;">
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
        `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="color: var(--danger); padding: 2rem; text-align: center;">${err.message}</div>`;
  }
}

function closeProtocolModal() {
  document.getElementById('protocol-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
});
