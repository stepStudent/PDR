// Administrator Controller

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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

let allGroups = [];
let selectedGroupId = null;

async function checkAdminSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || data.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    loadFilterGroups();
    loadAllResults();
    loadGroupsList();
    loadStats();
  } catch (err) {
    window.location.href = '/';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function switchAdminTab(tabName) {
  const tabs = ['results', 'groups', 'stats'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const sec = document.getElementById(`section-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (sec) sec.style.display = t === tabName ? 'block' : 'none';
  });

  if (tabName === 'results') loadAllResults();
  if (tabName === 'groups') loadGroupsList();
  if (tabName === 'stats') loadStats();
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

// -----------------------------------------------------------------------------
// CHANGE PASSWORD
// -----------------------------------------------------------------------------
function openChangePasswordModal() {
  document.getElementById('change-pass-modal').classList.add('active');
  document.getElementById('admin-curr-pass').value = '';
  document.getElementById('admin-new-pass').value = '';
  document.getElementById('admin-confirm-pass').value = '';
}

function closeChangePasswordModal() {
  document.getElementById('change-pass-modal').classList.remove('active');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const curr = document.getElementById('admin-curr-pass').value;
  const next = document.getElementById('admin-new-pass').value;
  const conf = document.getElementById('admin-confirm-pass').value;

  if (next !== conf) {
    showToast('Новий пароль та підтвердження не співпадають!', 'danger');
    return;
  }

  const btn = document.getElementById('btn-save-new-pass');
  btn.disabled = true;
  btn.textContent = 'Збереження...';

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: curr, newPassword: next })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка зміни пароля');

    showToast('Пароль адміністратора успішно оновлено! 🎉', 'success');
    closeChangePasswordModal();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Зберегти пароль';
  }
}

// -----------------------------------------------------------------------------
// RESULTS TAB
// -----------------------------------------------------------------------------
async function loadFilterGroups() {
  try {
    const res = await fetch('/api/auth/groups');
    allGroups = await res.json();
    const select = document.getElementById('filter-group');
    if (!select) return;

    select.innerHTML = '<option value="all">Усі навчальні групи</option>';
    allGroups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading filter groups:', err);
  }
}

async function loadAllResults() {
  const tbody = document.getElementById('results-table-body');
  const groupId = document.getElementById('filter-group').value;
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;

  try {
    const query = new URLSearchParams({ groupId, status, search }).toString();
    const res = await fetch(`/api/admin/results?${query}`);
    if (!res.ok) throw new Error('Помилка завантаження результатів');
    const results = await res.json();

    if (results.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Не знайдено жодного складеного іспиту за цими параметрами фільтра
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = results.map(r => `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td><strong>${r.student_surname}</strong></td>
        <td><span class="badge badge-primary">${r.group_name}</span></td>
        <td>
          <span style="font-size: 1.1rem; font-weight: 700; color: ${r.passed ? '#34d399' : '#f87171'};">
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
        <td>${formatDate(r.completed_at)}</td>
        <td>
          <span class="badge badge-locked" title="SHA-256: ${r.checksum_hash}">
            🔒 Захищено
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
    tbody.innerHTML = `<tr><td colspan="10" style="color: var(--danger); text-align: center; padding: 1.5rem;">${err.message}</td></tr>`;
  }
}

async function viewProtocol(resultId) {
  const modal = document.getElementById('protocol-modal');
  const body = document.getElementById('proto-modal-body');
  const subtitle = document.getElementById('proto-modal-subtitle');
  const seal = document.getElementById('proto-modal-seal');

  body.innerHTML = '<div style="text-align: center; padding: 2rem;">Завантаження офіційного протоколу...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`/api/admin/results/${resultId}`);
    if (!res.ok) throw new Error('Не вдалося завантажити протокол');
    const data = await res.json();

    subtitle.textContent = `Кандидат: ${data.student_surname} • Група: ${data.group_name} • Складено: ${formatDate(data.completed_at)} • Тривалість: ${formatDuration(data.duration_seconds)}`;
    seal.textContent = `🔒 Захищено тригерами БД • SHA-256: ${data.checksum_hash.substring(0, 20)}...`;

    body.innerHTML = `
      <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Правильних відповідей</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${data.passed ? '#34d399' : '#f87171'};">
            ${data.score} / ${data.total_questions}
          </div>
        </div>
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Кількість помилок</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${data.wrong_count <= 2 ? '#34d399' : '#f87171'};">
            ${data.wrong_count}
          </div>
        </div>
        <div class="card" style="flex: 1; padding: 1rem; text-align: center;">
          <div style="font-size: 0.8125rem; color: var(--text-muted);">Офіційне рішення</div>
          <div style="font-size: 1.125rem; font-weight: 800; margin-top: 4px;">
            ${data.passed ? '<span class="badge badge-success">🟢 ІСПИТ СКЛАДЕНО</span>' : '<span class="badge badge-danger">🔴 ІСПИТ НЕ СКЛАДЕНО</span>'}
          </div>
        </div>
      </div>

      <h3 style="margin-bottom: 1rem;">Повний перелік питань та відповідей кандидата:</h3>
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
                  label = ' <strong style="color: #f87171;">(Вибір учня)</strong>';
                } else if (idx === ans.selected_index && ans.is_correct) {
                  label = ' <strong style="color: #34d399;">(Вибір учня ✓)</strong>';
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
    body.innerHTML = `<div style="color: var(--danger); padding: 2rem;">${err.message}</div>`;
  }
}

function closeProtocolModal() {
  document.getElementById('protocol-modal').classList.remove('active');
}

// -----------------------------------------------------------------------------
// GROUPS & STUDENTS MANAGEMENT
// -----------------------------------------------------------------------------
async function loadGroupsList() {
  const container = document.getElementById('groups-cards-container');
  try {
    const res = await fetch('/api/admin/groups');
    allGroups = await res.json();

    if (allGroups.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
          Немає створених груп. Натисніть кнопку вище, щоб створити першу групу!
        </div>
      `;
      return;
    }

    container.innerHTML = allGroups.map(g => `
      <div class="group-card ${selectedGroupId === g.id ? 'active-card' : ''}">
        <div>
          <div class="group-header">
            <div class="group-title">${g.name}</div>
            <button onclick="handleDeleteGroup(${g.id}, '${g.name}')" class="btn btn-outline btn-sm" title="Видалити групу">🗑️</button>
          </div>
          <div class="group-desc">${g.description || 'Навчальна група автошколи'}</div>
        </div>

        <div>
          <div class="group-metrics">
            <div class="group-metric">
              Учнів:
              <strong>${g.student_count || 0}</strong>
            </div>
            <div class="group-metric">
              Іспитів:
              <strong>${g.exam_count || 0}</strong>
            </div>
            <div class="group-metric">
              Склали:
              <strong style="color: #34d399;">${g.passed_count || 0}</strong>
            </div>
          </div>

          <div class="group-actions">
            <button onclick="selectGroup(${g.id}, '${g.name}')" class="btn btn-primary btn-sm" style="flex: 1;">
              Управління учнями 👥
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // If a group was already selected, refresh its student list too
    if (selectedGroupId) {
      const g = allGroups.find(item => item.id === selectedGroupId);
      if (g) selectGroup(g.id, g.name);
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">${err.message}</div>`;
  }
}

async function selectGroup(groupId, groupName) {
  selectedGroupId = groupId;
  document.getElementById('current-group-title').textContent = `Студенти групи: ${groupName}`;
  document.getElementById('current-group-subtitle').textContent = `Паролі для входу перед іспитом. Усього студентів: завантаження...`;
  document.getElementById('group-students-section').style.display = 'block';
  document.getElementById('student-group-id').value = groupId;

  const tbody = document.getElementById('group-students-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1.5rem;">Завантаження списку учнів...</td></tr>';

  try {
    const res = await fetch(`/api/admin/groups/${groupId}/students`);
    const students = await res.json();
    document.getElementById('current-group-subtitle').textContent = `Паролі для входу перед іспитом. Усього студентів у групі: ${students.length}`;

    if (students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            У цій групі ще немає учнів. Додайте першого учня кнопкою «+ Додати учня» або «👥 Пакетне додавання»!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr>
        <td><strong>${s.surname}</strong></td>
        <td>
          <code style="background: rgba(37, 99, 235, 0.15); color: #93c5fd; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 700;">
            ${s.raw_password}
          </code>
        </td>
        <td>${s.attempts_count}</td>
        <td>${s.best_score !== null ? `${s.best_score} / 20` : '—'}</td>
        <td>
          ${s.has_passed 
            ? '<span class="badge badge-success">СКЛАДЕНО</span>' 
            : (s.attempts_count > 0 ? '<span class="badge badge-danger">НЕ СКЛАДЕНО</span>' : '<span class="badge badge-warning">НЕ СКЛАДАВ</span>')}
        </td>
        <td>
          <button onclick="handleDeleteStudent(${s.id}, '${s.surname}')" class="btn btn-outline btn-sm" title="Видалити учня">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');

    // Smooth scroll to students table
    document.getElementById('group-students-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger); text-align: center;">${err.message}</td></tr>`;
  }
}

// Create Group
function openCreateGroupModal() {
  document.getElementById('create-group-modal').classList.add('active');
  document.getElementById('new-group-name').value = '';
  document.getElementById('new-group-desc').value = '';
}

function closeCreateGroupModal() {
  document.getElementById('create-group-modal').classList.remove('active');
}

async function handleCreateGroup(e) {
  e.preventDefault();
  const name = document.getElementById('new-group-name').value;
  const description = document.getElementById('new-group-desc').value;

  try {
    const res = await fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка створення групи');

    showToast(`Групу «${name}» успішно створено!`, 'success');
    closeCreateGroupModal();
    loadGroupsList();
    loadFilterGroups();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleDeleteGroup(groupId, groupName) {
  if (!confirm(`Ви дійсно бажаєте видалити групу «${groupName}»?`)) return;

  try {
    const res = await fetch(`/api/admin/groups/${groupId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка видалення групи');

    showToast('Групу успішно видалено!', 'success');
    if (selectedGroupId === groupId) {
      selectedGroupId = null;
      document.getElementById('group-students-section').style.display = 'none';
    }
    loadGroupsList();
    loadFilterGroups();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Add Student
function openAddStudentModal() {
  if (!selectedGroupId) {
    showToast('Спочатку оберіть групу', 'warning');
    return;
  }
  document.getElementById('add-student-modal').classList.add('active');
  document.getElementById('student-surname').value = '';
  document.getElementById('student-password').value = '';
}

function closeAddStudentModal() {
  document.getElementById('add-student-modal').classList.remove('active');
}

async function handleAddStudent(e) {
  e.preventDefault();
  const groupId = document.getElementById('student-group-id').value;
  const surname = document.getElementById('student-surname').value;
  const password = document.getElementById('student-password').value;

  try {
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, surname, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка додавання учня');

    showToast(`Учня ${surname} додано! Пароль: ${data.password}`, 'success');
    closeAddStudentModal();
    const g = allGroups.find(item => item.id === Number(groupId));
    selectGroup(groupId, g ? g.name : 'Група');
    loadGroupsList();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Batch Add
function openBatchAddModal() {
  if (!selectedGroupId) {
    showToast('Спочатку оберіть групу', 'warning');
    return;
  }
  document.getElementById('batch-add-modal').classList.add('active');
  document.getElementById('batch-surnames').value = '';
}

function closeBatchAddModal() {
  document.getElementById('batch-add-modal').classList.remove('active');
}

async function handleBatchAdd(e) {
  e.preventDefault();
  const groupId = selectedGroupId;
  const surnamesText = document.getElementById('batch-surnames').value;

  try {
    const res = await fetch('/api/admin/students/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, surnamesText })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка пакетного додавання');

    showToast(`Успішно створено ${data.added.length} учнів з автоматичними паролями!`, 'success');
    closeBatchAddModal();
    const g = allGroups.find(item => item.id === Number(groupId));
    selectGroup(groupId, g ? g.name : 'Група');
    loadGroupsList();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleDeleteStudent(studentId, surname) {
  if (!confirm(`Ви дійсно бажаєте видалити учня ${surname}?`)) return;

  try {
    const res = await fetch(`/api/admin/students/${studentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка видалення');

    showToast('Учня успішно видалено', 'success');
    const g = allGroups.find(item => item.id === Number(selectedGroupId));
    selectGroup(selectedGroupId, g ? g.name : 'Група');
    loadGroupsList();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Print Group Credentials Cards
async function printGroupCredentials() {
  if (!selectedGroupId) return;

  try {
    const res = await fetch(`/api/admin/groups/${selectedGroupId}/students`);
    const students = await res.json();
    const g = allGroups.find(item => item.id === Number(selectedGroupId));
    const groupName = g ? g.name : 'Група';

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="text-align: center; margin-bottom: 5px;">КАРТКИ ДОСТУПУ ДО ТЕОРЕТИЧНОГО ІСПИТУ ПДР</h2>
        <p style="text-align: center; margin-bottom: 25px; color: #555;">Група: <strong>${groupName}</strong> • Офіційна екзаменаційна система МВС</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          ${students.map(s => `
            <div class="exam-card-print" style="border: 2px dashed #000; padding: 15px; border-radius: 8px;">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">
                🚗 ЕКЗАМЕН ПДР УКРАЇНИ
              </div>
              <div style="margin-bottom: 4px;">Група: <strong>${groupName}</strong></div>
              <div style="margin-bottom: 4px;">Прізвище: <strong style="font-size: 16px;">${s.surname}</strong></div>
              <div style="margin-bottom: 8px;">Пароль: <strong style="font-size: 16px; font-family: monospace;">${s.raw_password}</strong></div>
              <div style="font-size: 11px; color: #555;">Час іспиту: 20 хв • Питань: 20 • Дозволено помилок: ≤ 2</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    printArea.style.display = 'block';
    window.print();
    printArea.style.display = 'none';
  } catch (err) {
    showToast('Помилка підготовки карток до друку: ' + err.message, 'danger');
  }
}

// -----------------------------------------------------------------------------
// ANALYTICS & STATS
// -----------------------------------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) throw new Error('Помилка завантаження аналітики');
    const data = await res.json();

    const kpi = document.getElementById('stats-kpi-container');
    kpi.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon blue">📋</div>
        <div class="stat-info">
          <div class="stat-number">${data.totalExams}</div>
          <div class="stat-title">Всього складено іспитів</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">🎯</div>
        <div class="stat-info">
          <div class="stat-number">${data.passRate}%</div>
          <div class="stat-title">Успішність складання</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon purple">⭐</div>
        <div class="stat-info">
          <div class="stat-number">${data.avgScore} / 20</div>
          <div class="stat-title">Середній бал</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon orange">👥</div>
        <div class="stat-info">
          <div class="stat-number">${data.totalStudents}</div>
          <div class="stat-title">Зареєстровано учнів (${data.totalGroups} груп)</div>
        </div>
      </div>
    `;

    const recentTbody = document.getElementById('recent-exams-tbody');
    if (data.recentResults && data.recentResults.length > 0) {
      recentTbody.innerHTML = data.recentResults.map(r => `
        <tr>
          <td><strong>${r.student_surname}</strong></td>
          <td>${r.group_name}</td>
          <td><strong style="color: ${r.passed ? '#34d399' : '#f87171'};">${r.score} / 20</strong></td>
          <td>${r.passed ? '<span class="badge badge-success">СКЛАДЕНО</span>' : '<span class="badge badge-danger">НЕ СКЛАДЕНО</span>'}</td>
          <td>${formatDate(r.completed_at)}</td>
        </tr>
      `).join('');
    } else {
      recentTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Немає останніх іспитів</td></tr>';
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminSession();
});
