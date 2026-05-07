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

    // Find card: try common Tailwind padding classes, then walk up to first ancestor
    // with substantial text (≥60 chars) — handles any card class structure
    let card = btn.closest('div.p-4') || btn.closest('div.p-6') || btn.closest('div.p-5') || btn.closest('div.p-3');
    if (!card) {
      for (let el = btn.parentElement; el && el !== document.body; el = el.parentElement) {
        const t = el.innerText || el.textContent || '';
        if ((el.tagName === 'DIV' || el.tagName === 'LI' || el.tagName === 'ARTICLE') && t.length >= 60) {
          card = el; break;
        }
      }
    }
    const cardText = card?.innerText || card?.textContent || '';

    let campaignName = '';
    // Use specific selector first (text-sm font-semibold); broad fallback only if nothing found.
    // Among candidates, take the last one BEFORE the button in DOM order (handles multi-card
    // containers where Absent + Present cards share one div.p-4).
    // Also skip short status words like "Enabled" / "Disabled" that share the same class.
    const STATUS_WORDS = new Set(['enabled','disabled','active','inactive','paused','free','paid','running','stopped','draft','live']);
    const isCampaignSpan = el => {
      const t = el.textContent.replace(/Campaign\s*Name\s*:/i,'').trim();
      return t.length > 6 && !STATUS_WORDS.has(t.toLowerCase());
    };
    let spanPool = Array.from(card?.querySelectorAll('span.text-sm.font-semibold') || []).filter(isCampaignSpan);
    if (!spanPool.length)
      spanPool = Array.from(card?.querySelectorAll('[class*="font-semibold"]') || []).filter(isCampaignSpan);
    let nameEl = null;
    for (const span of spanPool) {
      if (span.compareDocumentPosition(btn) & 4) nameEl = span; // keep last span before btn
    }
    if (nameEl) campaignName = nameEl.textContent.replace(/Campaign\s*Name\s*:/i,'').trim();

    // FREE detection: three signals combined
    // 1) card has a green background element
    // 2) Radix id contains "trigger-Free" and is active (both cases)
    // 3) ANY active role=tab whose text includes "free" (handles emoji/count in label)
    const _bgGreen = !!card?.querySelector('[class*="bg-green"]');
    const _tabFree = !!(
      document.querySelector('[id*="trigger-Free"][data-state="active"]') ||
      document.querySelector('[id*="trigger-free"][data-state="active"]') ||
      Array.from(document.querySelectorAll('[role="tab"]')).some(t => {
        const active = t.getAttribute('data-state') === 'active' || t.getAttribute('aria-selected') === 'true';
        return active && t.textContent.trim().toLowerCase().includes('free');
      })
    );
    const category = (_bgGreen || _tabFree) ? 'FREE' : 'PAID';
    const cidMatch  = cardText.match(/(?:Challenge[_\s]*|CID\s*)(\d+)/i);
    const watiMatch = cardText.match(/wati\s+(\d+)/i);

    const textLow = cardText.toLowerCase();
    // detectStr: for absent/present/sunday use campaign name only (cardText may span multiple cards)
    // hintStr: for templateHint always include card text — campaign name may just be "Challenge_101"
    const detectStr = campaignName ? campaignName.toLowerCase() : textLow;
    const hintStr   = (campaignName.toLowerCase() + ' ' + textLow).trim();

    // Extract scheduler name (e.g. "Paid_Hindi_Night_Reminder_Sat") for reliable Hindi detection
    const schedulerMatch = cardText.match(/\bPaid_[A-Za-z_]+/);
    const schedulerName  = schedulerMatch ? schedulerMatch[0].toLowerCase() : '';
    const isHindi = schedulerName.includes('hindi') || hintStr.includes('hindi');

    let templateHint = '';
    if (hintStr.includes('renewal') || /x[-+]\d/.test(hintStr)) templateHint = 'renewal';
    else if (hintStr.includes('pause')) templateHint = 'pause';
    else if (hintStr.includes('consolidate') || hintStr.includes('night') || schedulerName.includes('night'))
      templateHint = isHindi ? 'night_hindi' : 'night';
    else if (hintStr.includes('sunday') && (hintStr.includes('attendance') || hintStr.includes('tracker') || hintStr.includes('milestone')))
      templateHint = 'sunday';
    else if (hintStr.includes('attendance') || hintStr.includes('tracker') || hintStr.includes('milestone'))
      templateHint = 'attendance';
    else if (hintStr.includes('reminder')) templateHint = 'reminder';

    // Extract day/batch from card text for Attendance broadcasts
    // (campaign name like "Challenge_101" has no day/batch info)
    const attDayMatch   = cardText.match(/\bday\s*(\d+)\b/i);
    const attDayHint    = attDayMatch ? `Day ${attDayMatch[1]}` : '';
    const attBatchMatch = cardText.match(/(\d+(?:st|nd|rd|th))\s*batch/i);
    const attBatchHint  = attBatchMatch ? `${attBatchMatch[1].toLowerCase()} batch` : '';

    // Detect absent/present/sunday from campaign name (reliable — campaign name is per-card)
    let broadcastType = '';
    if (detectStr.includes('sunday'))       broadcastType = 'sunday';
    else if (detectStr.includes('absent'))  broadcastType = 'absent';
    else if (detectStr.includes('present')) broadcastType = 'present';

    const timeMatch = cardText.match(/Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    const bcTime = timeMatch ? to24h(timeMatch[1].trim()) : '';

    // Extract broadcast date from card ("Date: 02 May 2026" → "2026-05-02")
    const dateMatch = cardText.match(/Date:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    let bcDate = '';
    if (dateMatch) {
      const MON = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
      const d = parseInt(dateMatch[1]);
      const m = MON[dateMatch[2].toLowerCase().slice(0,3)] || 0;
      const y = parseInt(dateMatch[3]);
      if (m) bcDate = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    const data = {
      campaignName,
      broadcastType,
      category,
      cid:            cidMatch  ? cidMatch[1]          : '',
      wati:           watiMatch ? 'wati '+watiMatch[1] : '',
      sentCount:      '',
      expectedCount:  '',
      yesterdayCount: '',
      templateHint,
      attDayHint,
      attBatchHint,
      bcTime,
      bcDate,
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

function to24h(t) {
  const m = (t || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return '';
  let h = parseInt(m[1]);
  const min = m[2];
  const isPM = m[3].toUpperCase() === 'PM';
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}

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
                    /System\s+Initialized[^:\n]*[:\-]?\s*[\d,]+/i.test(pageText) ||
                    /\bSent\s*[:\-]\s*[\d,]+/i.test(pageText);
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

    const triggeredMatch =
      text.match(/Total System Triggered[^:\n]*[:\-]?\s*([\d,]+)/i) ||
      text.match(/System Triggered[^:\n]*[:\-]?\s*([\d,]+)/i);

    const watiMatch = text.match(/wati\s+(\d+)/i);
    const cidMatch  = text.match(/Challenge[_\s]*(\d+)/i) || text.match(/\bCID\s*:?\s*(\d+)/i);

    chrome.storage.local.get(['autoExtracted'], (r) => {
      const data = r.autoExtracted || { extractedAt: Date.now() };
      if (sentMatch)     data.sentCount     = clean(sentMatch[1]);
      if (expectedMatch) data.expectedCount = clean(expectedMatch[1]);
      if (triggeredMatch) data.triggeredCount = clean(triggeredMatch[1]);
      if (watiMatch && !data.wati) data.wati = 'wati ' + watiMatch[1];
      if (cidMatch  && !data.cid)  data.cid  = cidMatch[1];
      chrome.storage.local.set({ autoExtracted: data });
      console.log('✅ Counts extracted — Sent:', data.sentCount, '| Expected:', data.expectedCount, '| Triggered:', data.triggeredCount);
    });
  } catch(e) {
    console.log('⚠️ Extract error:', e.message);
  }
}
