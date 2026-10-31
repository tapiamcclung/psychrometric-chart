// Collapsible left "Controls" sidebar (mirrors the right "Strategies" panel).
(function () {
  'use strict';
  var side = document.querySelector('.sidebar');
  var btn = document.getElementById('sidebar-toggle');
  var chev = btn.querySelector('.chev');
  btn.addEventListener('click', function () {
    var collapsed = side.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Collapse controls');
    chev.textContent = collapsed ? '›' : '‹';
  });
})();
