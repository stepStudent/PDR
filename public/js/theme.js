// Theme Manager (Light / Dark mode toggle)
(function () {
  // Apply saved theme immediately to prevent flashing
  const savedTheme = localStorage.getItem('pdr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pdr_theme', next);
  updateThemeButtonTitles();
}

function updateThemeButtonTitles() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const title = current === 'dark' ? 'Перемкнути на світлу тему' : 'Перемкнути на темну тему';
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.setAttribute('title', title);
    btn.setAttribute('aria-label', title);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeButtonTitles();
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
});
