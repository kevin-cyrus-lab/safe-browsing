(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const blockedUrlRaw = params.get('blocked_url') || params.get('url') || '';
  const tabIdRaw = params.get('tabId') || params.get('tabId');
  const score = params.get('score') || '';

  const tabId = tabIdRaw ? parseInt(tabIdRaw, 10) : null;

  const blockedEl = document.getElementById('blockedUrl');
  const reasonEl = document.getElementById('reason');

  blockedEl.textContent = blockedUrlRaw ? blockedUrlRaw : 'Unknown URL';
  reasonEl.textContent = score ? ('Reason: Suspicious score (' + score + ')') : 'Reason: Heuristic Flag';

  // Go Back -> ask background to restore previous URL (if saved)
  document.getElementById('goBack').addEventListener('click', () => {
    if (tabId) {
      chrome.runtime.sendMessage({ action: 'restoreTab', tabId }, (resp) => {
        // optional callback
      });
    } else {
      // fallback: close this tab if tabId not present
      chrome.runtime.sendMessage({ action: 'closeTab' });
    }
  });

  // Proceed -> ask background to navigate original tab to target URL
  document.getElementById('proceed').addEventListener('click', () => {
    if (!blockedUrlRaw) {
      alert('No URL found to proceed to.');
      return;
    }
    let target = blockedUrlRaw;
    try {
      new URL(target);
    } catch (err) {
      // try adding https if missing
      target = 'https://' + target;
    }

    if (tabId) {
      chrome.runtime.sendMessage({ action: 'navigateTab', tabId, url: target });
    } else {
      // fallback direct navigation (if running without tabId)
      window.location.href = target;
    }
  });

  // debug console
  console.log('Warning page ready. tabId=', tabId, 'blocked=', blockedUrlRaw);
})();
