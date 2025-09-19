console.log("Kai Shield Content running");

const THRESHOLD = 0.45;
const SUSPICIOUS_WORDS = [
  'login','verify','update','free','bank','secure','account','confirm','password','signin','reset','bonus','prize','click','claim','reward','credit','card','paypal','bit','wallet'
];
const SUSPICIOUS_TLDS = ['.xyz','.top','.club','.online','.site','.win','.info','.pw'];
const TRUSTED_DOMAINS = ['accounts.google.com','github.com','login.microsoftonline.com','www.facebook.com','www.reddit.com','paypal.com','amazon.com'];

function entropy(s){ if(!s) return 0; const freq={}; for(const ch of s) freq[ch]=(freq[ch]||0)+1; let e=0; for(const k in freq){const p=freq[k]/s.length;e-=p*Math.log2(p);} return e; }
function extractFeatures(url){
  const u=String(url||''); const lower=u.toLowerCase();
  const usesHttps = lower.startsWith('https://')?1:0;
  const lengthNorm = Math.min(u.length/250,1);
  let hostname=''; try{hostname=new URL(u).hostname}catch(e){hostname=lower;}
  const subCount = Math.max(0,hostname.split('.').length-2); const subNorm = Math.min(subCount/4,1);
  let suspiciousCount=0; for(const w of SUSPICIOUS_WORDS) if(lower.includes(w)) suspiciousCount++;
  suspiciousCount=Math.min(suspiciousCount/SUSPICIOUS_WORDS.length,1);
  const digits=(u.match(/\d/g)||[]).length; const digitRatio=Math.min(digits/Math.max(1,u.length),1);
  const specials=(u.match(/[^a-zA-Z0-9]/g)||[]).length; const specialRatio=Math.min(specials/Math.max(1,u.length),1);
  const ent = entropy(u); const entropyNorm = Math.min(ent/6,1);
  let tldSuspicious=0; for(const tld of SUSPICIOUS_TLDS) if(hostname.endsWith(tld)) tldSuspicious=1;
  return {usesHttps,lengthNorm,subNorm,suspiciousCount,digitRatio,specialRatio,entropyNorm,tldSuspicious};
}

const WEIGHTS = {usesHttps:-1.6,lengthNorm:0.9,subNorm:0.8,suspiciousCount:2,digitRatio:0.7,specialRatio:0.6,entropyNorm:0.9,tldSuspicious:1.5,bias:-0.5};
function scoreUrl(url){
  const f = extractFeatures(url);
  let s = WEIGHTS.bias + WEIGHTS.usesHttps*f.usesHttps + WEIGHTS.lengthNorm*f.lengthNorm + WEIGHTS.subNorm*f.subNorm
    + WEIGHTS.suspiciousCount*f.suspiciousCount + WEIGHTS.digitRatio*f.digitRatio + WEIGHTS.specialRatio*f.specialRatio
    + WEIGHTS.entropyNorm*f.entropyNorm + WEIGHTS.tldSuspicious*f.tldSuspicious;
  return 1/(1+Math.exp(-s));
}

function isTrusted(url){try{const h=new URL(url).hostname; return TRUSTED_DOMAINS.some(td=>h===td||h.endsWith('.'+td));}catch(e){return false;}}

function incrementWarnings(){ chrome.storage.local.get({warningsShown:0},data=>chrome.storage.local.set({warningsShown:data.warningsShown+1})); }

function decorateLinks(root=document){
  const links = root.querySelectorAll('a[href]');
  links.forEach(a=>{
    if(a.dataset.kaiBound) return;
    a.dataset.kaiBound='1';
    const href=a.href;
    if(isTrusted(href)){
      const span=document.createElement('span'); span.className='kai-badge kai-badge-trusted'; span.textContent='Trusted'; a.appendChild(span); return;
    }
    const score=scoreUrl(href);
    if(score>=THRESHOLD){
      a.classList.add('kai-suspicious');
      const span=document.createElement('span'); span.className='kai-badge kai-badge-danger'; span.textContent='⚠️'+Math.round(score*100)+'%'; a.appendChild(span);
      // Hover tooltip
      a.title = 'Risk Score: '+Math.round(score*100)+'%';
      a.addEventListener('click', ev=>{
        ev.preventDefault(); ev.stopPropagation();
        incrementWarnings();
        window.location.href=chrome.runtime.getURL("warning.html")+"?blocked_url="+encodeURIComponent(href)+"&score="+score.toFixed(2);
      }, {capture:true});
    }
  });
}

decorateLinks();
const mo = new MutationObserver(()=>decorateLinks());
mo.observe(document.documentElement||document.body,{childList:true,subtree:true});
