// Collapsible left "Controls" sidebar (mirrors the right "Strategies" panel).
(() => {
  'use strict';
  const side = document.querySelector('.sidebar');
  const btn = document.getElementById('sidebar-toggle');
  const chev = btn.querySelector('.chev');
  btn.addEventListener('click', () => {
    const collapsed = side.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', I18n.t(collapsed ? 'Expand controls' : 'Collapse controls'));
    chev.textContent = collapsed ? '›' : '‹';
  });
  document.addEventListener('i18n:change', () => {
    btn.setAttribute('aria-label', I18n.t(side.classList.contains('collapsed') ? 'Expand controls' : 'Collapse controls'));
  });
})();
