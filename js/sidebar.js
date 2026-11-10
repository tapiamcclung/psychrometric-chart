// Collapsible left "Controls" sidebar (mirrors the right "Strategies" panel).
(() => {
  'use strict';
  const side = document.querySelector('.sidebar');
  const btn = document.getElementById('sidebar-toggle');
  const chev = btn.querySelector('.chev');
  btn.addEventListener('click', () => {
    const collapsed = side.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Collapse controls');
    chev.textContent = collapsed ? '›' : '‹';
  });
})();
