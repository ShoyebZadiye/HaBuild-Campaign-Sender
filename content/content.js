// Replace old click listener so reopening the popup always uses a live context.
// NOTE: we intentionally do NOT cancel the running stats timer here —
// opening the popup while stats are loading must not interrupt extraction.
if (window._habuildClickHandler) {
  document.removeEventListener('click', window._habuildClickHandler, true);
}

// ── STATS BUTTON CLICK ────────────────────────
window._habuildClickHandler = function(event) {
  try {
    // Self-heal: if this context is dead, remove ourselves
    try { chrome.runtime.getManifest(); } catch(_) {
      document.removeEventListener('click', window._habuildClickHandler, true);
      window._habuildClickHandler = null;
      return;
    }

    const btn = event.target.closest('button');
    if (!btn) return;
    const btnText = btn.textContent.trim();
    if (!btnText.includes('Stats')) return;

    const card = btn.closest('div.p-4');
    const cardText = card?.innerText || card?.textContent || '';

    let campaignName = '';
    const nameEl = card?.querySelector('span.text-sm.font-semibold') ||
                   card?.querySelector('[class*="font-semibold"]');
    if (nameEl) campaignName = nameEl.textContent.replace(/Campaign\s*Name\s*:/i,'').trim();

    const category = card?.querySelector('[class*="bg-green"]') ? 'FREE' : 'PAID';
    const cidMatch  = cardText.match(/(?:Challenge[_\s]*|CID\s*)(\d+)/i);
    const watiMatch = cardText.match(/wati\s+(\d+)/i);

    const textLow = cardText.toLowerCase();
    let templateHint = '';
    if (textLow.includes('renewal') || /x[-+]\d/.test(textLow)) templateHint = 'renewal';
    else if (textLow.includes('pause')) templateHint = 'pause';
    else if (textLow.includes('consolidate')) templateHint = textLow.includes('hindi') ? 'night_hindi' : 'night';

    const data = {
      campaignName,
      category,
      cid:            cidMatch  ? cidMatch[1]          : '',
      wati:           watiMatch ? 'wati '+watiMatch[1] : '',
      sentCount:      '',
      expectedCount:  '',
      yesterdayCount: '',
      templateHint,
      extractedAt:    Date.now()
    };

    chrome.storage.local.set({ autoExtracted: data });
    console.log('📊 Stats clicked:', campaignName, '|', category);

    waitForStats();
  } catch(e) {
    console.log('⚠️ HaBuild click error:', e.message);
  }
};

document.addEventListener('click', window._habuildClickHandler, true);
console.log('✅ HaBuild content script loaded');

// ── WAIT FOR STATS DATA ───────────────────────
if (!window._habuildSession) window._habuildSession = 0;

function waitForStats() {
  // Cancel previous polling session (new Stats click started)
  if (window._habuildTimer) { clearInterval(window._habuildTimer); window._habuildTimer = null; }
  const session = ++window._habuildSession;

  let attempts = 0;
  window._habuildTimer = setInterval(() => {
    attempts++;
    if (attempts > 80 || session !== window._habuildSession) {
      clearInterval(window._habuildTimer); window._habuildTimer = null; return;
    }

    // Try innerText first, fall back to textContent for hidden elements
    const pageText = document.body?.innerText || document.body?.textContent || '';
    if (!pageText) return;

    const hasSent = /Total\s+(?:Provider\s+)?Sent\s*[:\-]?\s*[\d,]+/i.test(pageText) ||
                    /System\s+Initialized[^:\n]*[:\-]?\s*[\d,]+/i.test(pageText);
    if (!hasSent) return;

    clearInterval(window._habuildTimer); window._habuildTimer = null;
    extractCounts(pageText, session);
  }, 300);
}

// ── EXTRACT COUNTS FROM PAGE TEXT ────────────
function extractCounts(text, session) {
  if (session !== undefined && session !== window._habuildSession) return;
  try {
    const clean = s => s ? s.replace(/,/g, '').trim() : '';

    const sentMatch =
      text.match(/Total Provider Sent\s*[:\-]?\s*([\d,]+)/i) ||
      text.match(/Provider Sent\s*[:\-]?\s*([\d,]+)/i)       ||
      text.match(/Total Sent\s*[:\-]?\s*([\d,]+)/i)           ||
      text.match(/Messages? Sent\s*[:\-]?\s*([\d,]+)/i)       ||
      text.match(/Sent\s*:\s*([\d,]+)/i);

    const expectedMatch =
      text.match(/Total System Initialized[^:\n]*[:\-]?\s*([\d,]+)/i) ||
      text.match(/System Initialized[^:\n]*[:\-]?\s*([\d,]+)/i)       ||
      text.match(/Expected\s*[:\-]?\s*([\d,]+)/i)                      ||
      text.match(/Initialized[^:\n]*[:\-]?\s*([\d,]+)/i);

    const watiMatch = text.match(/wati\s+(\d+)/i);
    const cidMatch  = text.match(/Challenge[_\s]*(\d+)/i) || text.match(/\bCID\s*:?\s*(\d+)/i);

    chrome.storage.local.get(['autoExtracted'], (r) => {
      const data = r.autoExtracted || { extractedAt: Date.now() };
      if (sentMatch)     data.sentCount     = clean(sentMatch[1]);
      if (expectedMatch) data.expectedCount = clean(expectedMatch[1]);
      if (watiMatch && !data.wati) data.wati = 'wati ' + watiMatch[1];
      if (cidMatch  && !data.cid)  data.cid  = cidMatch[1];
      chrome.storage.local.set({ autoExtracted: data });
      console.log('✅ Counts extracted — Sent:', data.sentCount, '| Expected:', data.expectedCount);
    });
  } catch(e) {
    console.log('⚠️ Extract error:', e.message);
  }
}
