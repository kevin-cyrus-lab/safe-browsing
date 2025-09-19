console.log(" Shield Background running");

// --- Heuristic settings (keep your values) ---
const THRESHOLD = 0.45;
const SUSPICIOUS_WORDS = [
  'login','verify','update','free','bank','secure','account','confirm','password','signin','reset','bonus','prize','click','claim','reward','credit','card','paypal','bit','wallet'
];
const SUSPICIOUS_TLDS = ['.xyz','.top','.club','.online','.site','.win','.info','.pw'];
const TRUSTED_DOMAINS = [
  'accounts.google.com','github.com','login.microsoftonline.com',
  'www.facebook.com','www.reddit.com','paypal.com','amazon.com'
];

// --- entropy & feature extraction (same as before) ---
function entropy(s){
  if(!s) return 0;
  const freq = {};
  for(const ch of s) freq[ch] = (freq[ch]||0)+1;
  let e = 0;
  for(const k in freq){
    const p = freq[k]/s.length;
    e -= p*Math.log2(p);
  }
  return e;
}

function extractFeatures(url){
  const u = String(url||''); const lower = u.toLowerCase();
  const usesHttps = lower.startsWith('https://') ? 1 : 0;
  const lengthNorm = Math.min(u.length/250,1);
  let hostname = '';
  try { hostname = new URL(u).hostname; } catch(e) { hostname = lower; }
  const subCount = Math.max(0, hostname.split('.').length-2); const subNorm = Math.min(subCount/4,1);
  let suspiciousCount = 0; for(const w of SUSPICIOUS_WORDS) if(lower.includes(w)) suspiciousCount++;
  suspiciousCount = Math.min(suspiciousCount / SUSPICIOUS_WORDS.length, 1);
  const digits = (u.match(/\d/g)||[]).length; const digitRatio = Math.min(digits / Math.max(1,u.length), 1);
  const specials = (u.match(/[^a-zA-Z0-9]/g)||[]).length; const specialRatio = Math.min(specials / Math.max(1,u.length), 1);
  const ent = entropy(u); const entropyNorm = Math.min(ent/6,1);
  let tldSuspicious = 0; for(const tld of SUSPICIOUS_TLDS) if(hostname.endsWith(tld)) tldSuspicious = 1;
  return { usesHttps, lengthNorm, subNorm, suspiciousCount, digitRatio, specialRatio, entropyNorm, tldSuspicious };
}

const WEIGHTS = { usesHttps:-1.6, lengthNorm:0.9, subNorm:0.8, suspiciousCount:2, digitRatio:0.7, specialRatio:0.6, entropyNorm:0.9, tldSuspicious:1.5, bias:-0.5 };

function scoreUrl(url){
  const f = extractFeatures(url);
  let s = WEIGHTS.bias + WEIGHTS.usesHttps*f.usesHttps + WEIGHTS.lengthNorm*f.lengthNorm + WEIGHTS.subNorm*f.subNorm
    + WEIGHTS.suspiciousCount*f.suspiciousCount + WEIGHTS.digitRatio*f.digitRatio + WEIGHTS.specialRatio*f.specialRatio
    + WEIGHTS.entropyNorm*f.entropyNorm + WEIGHTS.tldSuspicious*f.tldSuspicious;
  return 1/(1+Math.exp(-s));
}

function isTrusted(url){
  try {
    const h = new URL(url).hostname;
    return TRUSTED_DOMAINS.some(td => h === td || h.endsWith('.' + td));
  } catch(e) { return false; }
}

// increment blocked counter helper
function incrementBlocked(callback){
  chrome.storage.local.get({ blockedClicks: 0 }, data => {
    const next = (data.blockedClicks || 0) + 1;
    chrome.storage.local.set({ blockedClicks: next }, () => {
      if (typeof callback === 'function') callback(next);
    });
  });
}

// Intercept main-frame navigations
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  // only main frame navigations
  if (typeof details.frameId !== 'undefined' && details.frameId !== 0) return;

  const url = details.url;
  if (!url) return;
  if (isTrusted(url)) return;

  const score = scoreUrl(url);
  if (score >= THRESHOLD) {
    // get current tab's url to preserve previous page (for Go Back)
    chrome.tabs.get(details.tabId, tab => {
      const prev = (tab && tab.url) ? tab.url : 'about:blank';

      // update storage: increment counter, store lastBlocked, and store prev_<tabId>
      chrome.storage.local.get({ blockedClicks: 0 }, data => {
        const next = (data.blockedClicks || 0) + 1;
        const store = { blockedClicks: next, lastBlocked: url };
        store['prev_' + details.tabId] = prev;
        chrome.storage.local.set(store, () => {
          // redirect the tab to the extension warning page (includes tabId so the warning page can command background)
          const warnUrl = chrome.runtime.getURL('warning.html')
            + '?blocked_url=' + encodeURIComponent(url)
            + '&score=' + score.toFixed(2)
            + '&tabId=' + details.tabId;
          chrome.tabs.update(details.tabId, { url: warnUrl });
          console.log("Kai blocked:", url, "Score:", score.toFixed(2));
        });
      });
    });
  }
}, { url: [{ schemes: ["http", "https"] }] });

// Message handler - receives commands from warning page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'restoreTab' && msg.tabId) {
    const tabId = msg.tabId;
    chrome.storage.local.get(['prev_' + tabId], data => {
      const prev = data['prev_' + tabId] || 'about:blank';
      chrome.tabs.update(tabId, { url: prev }, () => {
        // clean up saved prev
        chrome.storage.local.remove('prev_' + tabId);
      });
    });
  } else if (msg.action === 'closeTab' && msg.tabId) {
    chrome.tabs.remove(msg.tabId);
  } else if (msg.action === 'navigateTab' && msg.tabId && msg.url) {
    chrome.tabs.update(msg.tabId, { url: msg.url });
  }
});
