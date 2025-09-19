(() => {
  'use strict';
  const blockedCountEl = document.getElementById('blockedCount');
  const lastBlockEl = document.getElementById('lastBlock');
  const resetBtn = document.getElementById('reset');

  function refresh() {
    chrome.storage.local.get({ blockedClicks: 0, lastBlocked: 'None' }, data => {
      blockedCountEl.textContent = data.blockedClicks || 0;
      lastBlockEl.textContent = data.lastBlocked || 'None';
    });
  }

  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedClicks: 0, lastBlocked: 'None' }, () => {
      refresh();
    });
  });

  // refresh when popup opens
  document.addEventListener('DOMContentLoaded', refresh);
  // also refresh quickly in case storage changed while popup open
  setInterval(refresh, 2000);
})();
