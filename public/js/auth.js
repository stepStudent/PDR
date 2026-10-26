// Auth Controller for Index Page

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

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

function switchAuthTab(mode) {
  const tabUser = document.getElementById('tab-user');
  const tabAdmin = document.getElementById('tab-admin');
  const formUser = document.getElementById('form-user-login');
  const formAdmin = document.getElementById('form-admin-login');

  if (mode === 'user') {
    tabUser.classList.add('active');
    tabAdmin.classList.remove('active');
    formUser.style.display = 'block';
    formAdmin.style.display = 'none';
  } else {
    tabAdmin.classList.add('active');
    tabUser.classList.remove('active');
    formAdmin.style.display = 'block';
    formUser.style.display = 'none';
  }
}

// Fetch groups for candidate login select
async function loadGroups() {
  try {
    const res = await fetch('/api/auth/groups');
    if (!res.ok) throw new Error('Не вдалося завантажити список груп');
    const groups = await res.json();
    const select = document.getElementById('user-group');
    if (!select) return;

    select.innerHTML = '<option value="">Оберіть вашу групу...</option>';
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.description || 'Навчальна група'})`;
      select.appendChild(opt);
    });
  } catch (err) {
    showToast('Помилка завантаження груп: ' + err.message, 'danger');
  }
}

// Check if already authenticated
async function checkCurrentSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      if (data.role === 'admin') {
        window.location.href = '/admin';
      } else if (data.role === 'user') {
        window.location.href = '/user';
      }
    }
  } catch (e) {
    // ignore
  }
}

// Handle Candidate login
async function handleUserLogin(e) {
  e.preventDefault();
  const groupId = document.getElementById('user-group').value;
  const surname = document.getElementById('user-surname').value;
  const password = document.getElementById('user-password').value;
  const btn = document.getElementById('btn-user-submit');

  if (!groupId) {
    showToast('Будь ласка, оберіть навчальну групу', 'warning');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Авторизація...';

  try {
    const res = await fetch('/api/auth/user-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, surname, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Помилка авторизації');
    }

    showToast(`Вітаємо, ${data.user.surname}! Перехід до іспиту...`, 'success');
    setTimeout(() => {
      window.location.href = '/user';
    }, 600);
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
    btn.textContent = 'Увійти та розпочати іспит →';
  }
}

// Handle Admin login
async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-username').value;
  const password = document.getElementById('admin-password').value;
  const btn = document.getElementById('btn-admin-submit');

  btn.disabled = true;
  btn.textContent = 'Авторизація...';

  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Помилка авторизації адміністратора');
    }

    showToast('Успішна авторизація адміністратора!', 'success');
    setTimeout(() => {
      window.location.href = '/admin';
    }, 600);
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
    btn.textContent = 'Увійти в панель адміністратора 🛡️';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkCurrentSession();
  loadGroups();
});
