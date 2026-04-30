// ── FIREBASE CONFIG ───────────────────────────
const API_KEY = 'AIzaSyAj5m1-NUOhaptk4Q26dqPKr537MFFobmk';
const PROJECT = 'dashbordpublic';
const FS_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── STATE ─────────────────────────────────────
let currentType = 'PAID';
let lastScanData = null;
let paidCamps = [{name:'', sent:'', expected:'', wati:'all WATIs'}];

// ── FIELD LISTS ───────────────────────────────
const FREE_FIELDS = ['campaignName','sentCount','expectedCount','yesterdayCount','challengeId','batch','watiSelFree'];
const PAID_STATIC = ['paidTemplate','paidWati','simpleTimePrefix','simpleNote',
  'pauseSent','pauseExpected','unpauseSent','unpauseExpected',
  'renewX1','renewX2','renewX3','renewX','renewXp1','renewXp2','renewXp3',
  'remBatch','remYESent','remYEExp','remHindiSent','remHindiExp',
  'nightPresentSent','nightPresentExp','nightAbsentSent','nightAbsentExp',
  'nightHindiPresentSent','nightHindiPresentExp','nightHindiAbsentSent','nightHindiAbsentExp',
  'nightSundaySent','nightSundayExp','nightHindiSundaySent','nightHindiSundayExp',
  'attendBatch','att1Sent','att1Exp','att2Sent','att2Exp','att3Sent','att3Exp','att3Wati',
  'paidYestCount'];

// ══════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ══════════════════════════════════════════════
// CAMPAIGN TYPE TOGGLE
// ══════════════════════════════════════════════
function setType(type) {
  currentType = type;
  document.getElementById('typeFree').classList.toggle('active', type === 'FREE');
  document.getElementById('typePaid').classList.toggle('active', type === 'PAID');
  document.getElementById('freeFields').style.display = type === 'FREE' ? 'flex' : 'none';
  document.getElementById('paidFields').style.display = type === 'PAID' ? 'flex' : 'none';
  if (type === 'PAID') onTemplateChange();
  else updatePreview();
  saveData();
}

// ══════════════════════════════════════════════
// PAID TEMPLATE LOGIC
// ══════════════════════════════════════════════
function onTemplateChange() {
  const tpl       = document.getElementById('paidTemplate')?.value || 'standard';
  const isStd     = tpl === 'standard';
  const isSimple  = tpl === 'simple';
  const isPause   = tpl === 'pause';
  const isRenewal = tpl.startsWith('renewal');
  const isAttend  = tpl === 'attendance';
  const isRemind  = tpl === 'reminder';
  const isNight      = tpl === 'night';
  const isNightHindi = tpl === 'night_hindi';

  showEl('campRowsWrap',     isStd || isSimple);
  showEl('addCampBtn',       isStd);
  showEl('simplePrefixWrap', false);
  showEl('pauseWrap',        isPause,        true);
  showEl('renewalWrap',      isRenewal,      true);
  showEl('reminderWrap',     isRemind,       true);
  showEl('nightWrap',        isNight,        true);
  showEl('nightHindiWrap',   isNightHindi,   true);
  showEl('attendWrap',       isAttend,       true);
  showEl('paidTotalWrap',    isStd || isAttend || isRemind || isNight || isNightHindi);
  showEl('paidYestWrap',     !isPause && !isRenewal);

  if (isNightHindi) {
    const watiEl = document.getElementById('paidWati');
    if (watiEl && watiEl.value !== 'Wati 11') watiEl.value = 'Wati 11';
  }

  if (isSimple && paidCamps.length > 1) paidCamps = [paidCamps[0]];

  renderCampRows();
  renderRenewal();
  updatePreview();
}

// visible=true → display:flex if flex=true, else default; visible=false → display:none
function showEl(id, visible, flex) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = visible ? (flex ? 'flex' : '') : 'none';
}

// ── CAMPAIGN ROWS ─────────────────────────────
function renderCampRows() {
  const tpl      = document.getElementById('paidTemplate')?.value || 'standard';
  const showExp  = true;
  const isAttend = tpl === 'attendance';
  const watiOpts = ['all paid WATIs','all WATIs','Wati 11','Wati 14','Wati 29'];
  const wrap     = document.getElementById('campRowsWrap');
  if (!wrap) return;

  wrap.innerHTML = paidCamps.map((c, i) => `
    <div class="camp-row">
      <div class="camp-row-hdr">
        <span>Campaign ${i + 1}</span>
        ${paidCamps.length > 1 ? `<button type="button" class="camp-rm" data-i="${i}">✕</button>` : ''}
      </div>
      <input class="camp-inp" data-i="${i}" data-f="name" type="text"
        placeholder="Campaign name" value="${esc(c.name)}">
      <div class="row2" style="margin-top:6px">
        <div class="field">
          <label>Sent</label>
          <input class="camp-inp" data-i="${i}" data-f="sent"
            type="number" placeholder="0" value="${c.sent || ''}">
        </div>
        ${showExp ? `<div class="field">
          <label>Expected</label>
          <input class="camp-inp" data-i="${i}" data-f="expected"
            type="number" placeholder="0" value="${c.expected || ''}">
        </div>` : ''}
      </div>
      ${isAttend ? `<div class="field" style="margin-top:6px">
        <label>WATI</label>
        <select class="camp-inp" data-i="${i}" data-f="wati">
          ${watiOpts.map(o => `<option value="${o}" ${(c.wati||'all WATIs')===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
  `).join('');

  wrap.querySelectorAll('.camp-inp').forEach(el => {
    el.addEventListener('input', e => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      paidCamps[i][f] = e.target.value;
      if (f === 'sent') updateTotal();
      updatePreview();
      saveData();
    });
  });
  wrap.querySelectorAll('.camp-rm').forEach(btn => {
    btn.addEventListener('click', e => removeCamp(+e.currentTarget.dataset.i));
  });
}

function addCamp() {
  // Sync current DOM values into paidCamps before adding new row
  document.querySelectorAll('#campRowsWrap .camp-inp').forEach(el => {
    const i = +el.dataset.i;
    const f = el.dataset.f;
    if (paidCamps[i] !== undefined) paidCamps[i][f] = el.value;
  });
  paidCamps.push({name:'', sent:'', expected:'', wati:'all WATIs'});
  renderCampRows();
  updateTotal();
  const prev = document.getElementById('preview');
  if (prev) prev.dataset.userEdited = 'false';
  updatePreview();
  saveData();
}

function removeCamp(idx) {
  if (paidCamps.length <= 1) return;
  paidCamps.splice(idx, 1);
  renderCampRows();
  updateTotal();
  const prev = document.getElementById('preview');
  if (prev) prev.dataset.userEdited = 'false';
  updatePreview();
  saveData();
}

function updateTotal() {
  const total = paidCamps.reduce((s, c) => s + (parseInt(c.sent) || 0), 0);
  const el = document.getElementById('paidTotal');
  if (el) el.value = total || '';
  return total;
}

function renderRenewal() {
  const tpl = document.getElementById('paidTemplate')?.value || 'standard';
  showEl('renewalMinusFields', tpl === 'renewal_minus');
  showEl('renewalPlusFields',  tpl === 'renewal_plus');
}

// ── CLEAR COUNTS FOR A TEMPLATE (fresh start) ────
function clearTemplateFields(tpl) {
  if (tpl === 'pause') {
    ['pauseSent','pauseExpected','unpauseSent','unpauseExpected'].forEach(f => setVal(f, ''));
  } else if (tpl === 'renewal_minus') {
    ['renewX1','renewX2','renewX3'].forEach(f => setVal(f, ''));
  } else if (tpl === 'renewal_plus') {
    ['renewX','renewXp1','renewXp2','renewXp3'].forEach(f => setVal(f, ''));
  } else if (tpl === 'attendance') {
    ['att1Sent','att1Exp','att2Sent','att2Exp','att3Sent','att3Exp'].forEach(f => setVal(f, ''));
  } else if (tpl === 'reminder') {
    ['remYESent','remYEExp','remHindiSent','remHindiExp'].forEach(f => setVal(f, ''));
    setVal('remBatch', '1st');
  } else if (tpl === 'night') {
    ['nightAbsentSent','nightAbsentExp','nightPresentSent','nightPresentExp',
     'nightSundaySent','nightSundayExp'].forEach(f => setVal(f, ''));
  } else if (tpl === 'night_hindi') {
    ['nightHindiAbsentSent','nightHindiAbsentExp','nightHindiPresentSent','nightHindiPresentExp',
     'nightHindiSundaySent','nightHindiSundayExp'].forEach(f => setVal(f, ''));
  } else {
    paidCamps = [{name:'', sent:'', expected:'', wati:'all WATIs'}];
  }
  setVal('paidYestCount', '');
}

// ── DETECT TEMPLATE FROM LIVE PAGE ────────────
async function detectPageTemplate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('habuild.in')) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const buttons = [...document.querySelectorAll('button')]
          .filter(b => b.textContent.trim() === 'Stats');
        const allText = buttons.map(btn => {
          const card = btn.closest('div.p-4');
          return (card?.innerText || '').toLowerCase();
        }).join('\n');
        if (allText.includes('renewal') || /x[-+]\d/.test(allText)) return 'renewal';
        if (allText.includes('pause')) return 'pause';
        return null;
      }
    });

    const hint = results[0]?.result;
    if (!hint) return;

    const tpl = hint === 'renewal'
      ? (new Date().getHours() >= 21 ? 'renewal_plus' : 'renewal_minus')
      : 'pause';

    const tplEl = document.getElementById('paidTemplate');
    if (!tplEl) return;
    tplEl.value = tpl;
    clearTemplateFields(tpl);
    onTemplateChange();
  } catch(e) { /* not on admin panel */ }
}

// ── AUTO-DETECT TEMPLATE FROM CAMPAIGN NAME + HINT + TIME ───
function autoDetectTemplate(data) {
  const hint = (data.templateHint || '').toLowerCase();
  const name = (data.campaignName  || '').toLowerCase();
  const isRenewal = hint === 'renewal' || name.includes('renewal') || /x[-+]\d/.test(name);
  const isPause   = hint === 'pause'   || name.includes('pause');

  if (isRenewal) {
    const h = new Date().getHours();
    return h >= 21 ? 'renewal_plus' : 'renewal_minus';
  }
  if (isPause)                                           return 'pause';
  if (name.includes('hindi') && (name.includes('night') || name.includes('consolidate') || name.includes('combined')))
                                                         return 'night_hindi';
  if (name.includes('night') || name.includes('consolidate') || name.includes('combined') ||
      (name.includes('sunday') && name.includes('attendance')))
                                                         return 'night';
  if (name.includes('attendance') || name.includes('milestone') || name.includes('tracker'))
                                                         return 'attendance';
  if (name.includes('_se') || name.includes('se_') || name.includes('strong'))
                                                         return 'simple';
  if (name.includes('reminder'))                         return 'reminder';
  return null;
}

// ── BUILD PAID MESSAGE ────────────────────────
function buildPaidMessage() {
  const tpl       = document.getElementById('paidTemplate')?.value || 'standard';
  const wati      = document.getElementById('paidWati')?.value || 'all paid WATIs';
  const yest      = val('paidYestCount');
  const yestLabel = getPrevLabel();

  if (tpl === 'standard') {
    const rows = paidCamps.filter(c => c.name || c.sent);
    if (!rows.length) return '— Campaign details bharo —';
    let msg   = '*UPDATE :✅*';
    let total = 0;
    rows.forEach(c => {
      const s    = parseInt(c.sent)     || 0;
      const e    = parseInt(c.expected) || 0;
      const diff = c.expected !== '' ? Math.abs(e - s) : '';
      msg   += `\n\n*${c.name}* message sent to ${s} users on ${wati}.`;
      msg   += `\nExpected: ${e}`;
      if (diff !== '') msg += `\nDifference: ${diff}`;
      total += s;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal : ${total}`;
    if (yest) msg += `\n${yestLabel} : ${yest}`;
    return msg;
  }

  if (tpl === 'simple') {
    const c    = paidCamps[0] || {};
    const name = c.name || '';
    const s    = parseInt(c.sent) || 0;
    let msg = `*UPDATE:*${name ? ' ' + name : ''} sent to ${s} users on ${wati}.`;
    if (c.expected) {
      const e = parseInt(c.expected);
      msg += `\nExpected: ${e}`;
      msg += `\nDifference: ${Math.abs(e - s)}`;
    }
    if (yest) msg += `\n${yestLabel}: ${yest}`;
    return msg;
  }

  if (tpl === 'pause') {
    const pS = parseInt(val('pauseSent'))      || 0;
    const pE = parseInt(val('pauseExpected'))  || 0;
    const uS = parseInt(val('unpauseSent'))    || 0;
    const uE = parseInt(val('unpauseExpected'))|| 0;
    return `*UPDATE: ✅*\n*Pause Subscription Message* sent to ${pS} users on all paid WATIs\nExpected count: ${pE}\nDifference: ${Math.abs(pE - pS)}\n\n*Unpause Subscription Message* sent to ${uS} users on all paid WATIs\nExpected count: ${uE}\nDifference: ${Math.abs(uE - uS)}`;
  }

  if (tpl === 'renewal_minus') {
    const x1 = parseInt(val('renewX1')) || 0;
    const x2 = parseInt(val('renewX2')) || 0;
    const x3 = parseInt(val('renewX3')) || 0;
    return `*UPDATE: ✅*\n\n*Paid*\nX-1 Renewal message sent to ${x1} users on all WATIs.\nX-2 Renewal message sent to ${x2} users on all WATIs.\nX-3 Renewal message sent to ${x3} users on all WATIs.`;
  }

  if (tpl === 'renewal_plus') {
    const x  = parseInt(val('renewX'))   || 0;
    const x1 = parseInt(val('renewXp1')) || 0;
    const x2 = parseInt(val('renewXp2')) || 0;
    const x3 = parseInt(val('renewXp3')) || 0;
    return `*UPDATE:*\n\n*Paid*\nX Renewal message sent to ${x} users on all WATIs.\nX+1 Renewal message sent to ${x1} users on all WATIs.\nX+2 Renewal message sent to ${x2} users on all WATIs.\nX+3 Renewal message sent to ${x3} users on all WATIs.`;
  }

  if (tpl === 'attendance') {
    const batch = val('attendBatch') || '1st';
    const slots = [
      { name: 'Attendance tracker',       sId: 'att1Sent', eId: 'att1Exp', w: wati },
      { name: 'Milestone tracker',        sId: 'att2Sent', eId: 'att2Exp', w: wati },
      { name: 'Hindi Attendance tracker', sId: 'att3Sent', eId: 'att3Exp', w: val('att3Wati') || 'Wati 11' },
    ];
    const rows = slots.filter(s => parseInt(val(s.sId)) > 0);
    if (!rows.length) return '— Attendance counts bharo —';
    let msg = '*UPDATE* :✅', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\nPAID ${batch} BATCH ${s.name} sent to ${sent} users on ${s.w}.`;
      msg += `\nExpected: ${exp} Difference: ${diff !== '' ? diff : 0}`;
      total += sent;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal count: ${total.toLocaleString()}`;
    if (yest) msg += `\n${yestLabel}: ${yest}`;
    return msg;
  }

  if (tpl === 'reminder') {
    const batch = val('remBatch') || '1st';
    const slots = [
      { name: 'Paid_YE_Reminder',    sId: 'remYESent',    eId: 'remYEExp' },
      { name: 'Paid_Hindi_Reminder', sId: 'remHindiSent', eId: 'remHindiExp' },
    ];
    const rows = slots.filter(s => parseInt(val(s.sId)) > 0);
    if (!rows.length) return '— Reminder counts bharo —';
    let msg = '*UPDATE* :✅', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\nPAID ${batch} BATCH *${s.name}* message sent to ${sent} users on ${wati}.`;
      if (exp > 0) msg += `\nExpected: ${exp} Difference: ${diff !== '' ? diff : 0}`;
      total += sent;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal: ${total.toLocaleString()}`;
    if (yest) msg += `\n${yestLabel} : ${yest}`;
    return msg;
  }

  if (tpl === 'night') {
    const slots = [
      { name: 'PAID Combined Absent & Night Reminder',  sId: 'nightAbsentSent',  eId: 'nightAbsentExp'  },
      { name: 'PAID Combined Present & Night Reminder', sId: 'nightPresentSent', eId: 'nightPresentExp' },
      { name: 'Sunday Attendance Summary',               sId: 'nightSundaySent',  eId: 'nightSundayExp'  },
    ];
    const rows = slots.filter(s => parseInt(val(s.sId)) > 0);
    if (!rows.length) return '— Night counts bharo —';
    let msg = '*UPDATE* :✅', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\n*${s.name}* message sent to ${sent} users on ${wati}.`;
      msg += `\nExpected: ${exp}${diff !== '' ? ' Difference: ' + diff : ''}`;
      total += sent;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal : ${total.toLocaleString()}`;
    if (yest) msg += `\n${yestLabel}: ${yest}`;
    return msg;
  }

  if (tpl === 'night_hindi') {
    const slots = [
      { name: 'PAID Hindi Combined Absent & Night Reminder',  sId: 'nightHindiAbsentSent',  eId: 'nightHindiAbsentExp'  },
      { name: 'PAID Hindi Combined Present & Night Reminder', sId: 'nightHindiPresentSent', eId: 'nightHindiPresentExp' },
      { name: 'Hindi Sunday Attendance Summary',               sId: 'nightHindiSundaySent',  eId: 'nightHindiSundayExp'  },
    ];
    const rows = slots.filter(s => parseInt(val(s.sId)) > 0);
    if (!rows.length) return '— Night Hindi counts bharo —';
    let msg = '*UPDATE* :✅', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\n*${s.name}* message sent to ${sent} users on Wati 11.`;
      msg += `\nExpected: ${exp}${diff !== '' ? ' Difference: ' + diff : ''}`;
      total += sent;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal : ${total.toLocaleString()}`;
    if (yest) msg += `\n${yestLabel}: ${yest}`;
    return msg;
  }

  return '';
}

// ── DETECT PAID SUB-TYPE FROM CAMPAIGN NAME ───
function detectSubtype(campaignName, tpl) {
  if (tpl === 'renewal_minus' || tpl === 'renewal_plus') return 'renewal';
  if (tpl === 'pause') return 'pause/unpause';
  if (tpl === 'attendance') return 'attendance';
  if (tpl === 'reminder')   return 'reminder';
  if (tpl === 'night' || tpl === 'night_hindi') return 'night';
  const n = (campaignName || '').toLowerCase();
  if (n.includes('reminder') && !n.includes('night'))                     return 'reminder';
  if (n.includes('_ye') || n.includes('ye_') || n.includes('yoga'))      return 'yoga';
  if (n.includes('_se') || n.includes('se_') || n.includes('strong'))    return 'strong';
  if (n.includes('attendance') || n.includes('milestone') ||
      n.includes('absent')     || n.includes('present')  ||
      n.includes('hindi')      || n.includes('night')    ||
      n.includes('combined'))                                             return 'attendance';
  return 'PAID';
}

function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════
// MESSAGE PREVIEW
// ══════════════════════════════════════════════
function updatePreview() {
  const preview = document.getElementById('preview');
  if (!preview || preview.dataset.userEdited === 'true') return;

  let msg = '';
  if (currentType === 'FREE') {
    const name     = val('campaignName');
    const sent     = val('sentCount');
    const expected = val('expectedCount');
    const cid      = val('challengeId');
    const batch    = val('batch');
    const wati     = val('watiSelFree');
    const yest     = val('yesterdayCount');
    const diff     = (sent && expected) ? Math.abs(parseInt(expected) - parseInt(sent)) : '';
    msg = `*UPDATE:* ✅\nCID ${cid} ${batch} *${name}* sent to *${sent}* users on ${wati}.\nExpected count: *${expected}*\nDifference: *${diff}*\n\n${getPrevLabel()}: *${yest}*`;
  } else {
    msg = buildPaidMessage();
  }

  preview.value = msg;
  saveData();
}

// ══════════════════════════════════════════════
// COPY & WHATSAPP
// ══════════════════════════════════════════════
function copyMsg() {
  const text = document.getElementById('preview').value;
  if (!text.trim()) { showFeedback('Pehle fields bharo', 'error'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showFeedback('✅ Copied to clipboard!', 'success'))
    .catch(() => showFeedback('Copy failed', 'error'));
}

function sendWhatsApp() {
  const text = document.getElementById('preview').value;
  if (!text.trim()) { showFeedback('Pehle fields bharo', 'error'); return; }
  chrome.tabs.create({ url: 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text) });
}

async function copyAndSave() {
  const text = document.getElementById('preview').value;
  if (!text.trim() || text.includes('— ')) { showFeedback('Pehle fields bharo', 'error'); return; }

  try { await navigator.clipboard.writeText(text); } catch(e) {}
  showFeedback('⏳ Saving...', 'info');

  try {
    const now   = new Date();
    const today = now.toISOString().slice(0, 10);
    const time  = now.toTimeString().slice(0, 5);
    const entries = [];

    if (currentType === 'FREE') {
      const msgname = val('campaignName');
      if (!msgname) { showFeedback('Campaign Name bharo', 'error'); return; }
      const sent     = parseInt(val('sentCount'))     || 0;
      const expected = parseInt(val('expectedCount')) || 0;
      entries.push({ msgname, sent, expected, diff: expected - sent });
    } else {
      const tpl = document.getElementById('paidTemplate')?.value || 'standard';

      if (tpl === 'standard' || tpl === 'simple') {
        const rows = paidCamps.filter(c => c.name || c.sent);
        if (!rows.length) { showFeedback('Campaign details bharo', 'error'); return; }
        rows.forEach(c => {
          const s = parseInt(c.sent)     || 0;
          const e = parseInt(c.expected) || 0;
          entries.push({ msgname: c.name, sent: s, expected: e, diff: e - s });
        });
      } else if (tpl === 'attendance') {
        const batch = val('attendBatch') || '1st';
        [
          { name: `${batch} BATCH Attendance tracker`,       s: 'att1Sent', e: 'att1Exp' },
          { name: `${batch} BATCH Milestone tracker`,        s: 'att2Sent', e: 'att2Exp' },
          { name: `${batch} BATCH Hindi Attendance tracker`, s: 'att3Sent', e: 'att3Exp' },
        ].filter(r => parseInt(val(r.s)) > 0).forEach(r => {
          const s = parseInt(val(r.s)) || 0, e = parseInt(val(r.e)) || 0;
          entries.push({ msgname: r.name, sent: s, expected: e, diff: e - s });
        });
      } else if (tpl === 'reminder') {
        [
          { name: 'Paid_YE_Reminder',    s: 'remYESent',    e: 'remYEExp' },
          { name: 'Paid_Hindi_Reminder', s: 'remHindiSent', e: 'remHindiExp' },
        ].filter(r => parseInt(val(r.s)) > 0).forEach(r => {
          const s = parseInt(val(r.s)) || 0, e = parseInt(val(r.e)) || 0;
          entries.push({ msgname: r.name, sent: s, expected: e, diff: e - s });
        });
      } else if (tpl === 'night') {
        [
          { name: 'PAID Combined Absent & Night Reminder',  s: 'nightAbsentSent',  e: 'nightAbsentExp'  },
          { name: 'PAID Combined Present & Night Reminder', s: 'nightPresentSent', e: 'nightPresentExp' },
          { name: 'Sunday Attendance Summary',               s: 'nightSundaySent',  e: 'nightSundayExp'  },
        ].filter(r => parseInt(val(r.s)) > 0).forEach(r => {
          const s = parseInt(val(r.s)) || 0, e = parseInt(val(r.e)) || 0;
          entries.push({ msgname: r.name, sent: s, expected: e, diff: e - s });
        });
      } else if (tpl === 'night_hindi') {
        [
          { name: 'PAID Hindi Combined Absent & Night Reminder',  s: 'nightHindiAbsentSent',  e: 'nightHindiAbsentExp'  },
          { name: 'PAID Hindi Combined Present & Night Reminder', s: 'nightHindiPresentSent', e: 'nightHindiPresentExp' },
          { name: 'Hindi Sunday Attendance Summary',               s: 'nightHindiSundaySent',  e: 'nightHindiSundayExp'  },
        ].filter(r => parseInt(val(r.s)) > 0).forEach(r => {
          const s = parseInt(val(r.s)) || 0, e = parseInt(val(r.e)) || 0;
          entries.push({ msgname: r.name, sent: s, expected: e, diff: e - s });
        });
      } else if (tpl === 'pause') {
        const pS = parseInt(val('pauseSent'))      || 0;
        const pE = parseInt(val('pauseExpected'))  || 0;
        const uS = parseInt(val('unpauseSent'))    || 0;
        const uE = parseInt(val('unpauseExpected'))|| 0;
        entries.push({ msgname: 'Pause Subscription Message',   sent: pS, expected: pE, diff: pE - pS });
        entries.push({ msgname: 'Unpause Subscription Message', sent: uS, expected: uE, diff: uE - uS });
      } else if (tpl === 'renewal_minus') {
        entries.push({ msgname: 'X-1 Renewal', sent: parseInt(val('renewX1')) || 0, expected: 0, diff: 0 });
        entries.push({ msgname: 'X-2 Renewal', sent: parseInt(val('renewX2')) || 0, expected: 0, diff: 0 });
        entries.push({ msgname: 'X-3 Renewal', sent: parseInt(val('renewX3')) || 0, expected: 0, diff: 0 });
      } else if (tpl === 'renewal_plus') {
        entries.push({ msgname: 'X Renewal',   sent: parseInt(val('renewX'))   || 0, expected: 0, diff: 0 });
        entries.push({ msgname: 'X+1 Renewal', sent: parseInt(val('renewXp1'))|| 0, expected: 0, diff: 0 });
        entries.push({ msgname: 'X+2 Renewal', sent: parseInt(val('renewXp2'))|| 0, expected: 0, diff: 0 });
        entries.push({ msgname: 'X+3 Renewal', sent: parseInt(val('renewXp3'))|| 0, expected: 0, diff: 0 });
      }
    }

    if (!entries.length) { showFeedback('Kuch bharo pehle', 'error'); return; }

    // Stamp category on every entry (needed for BC matching filter)
    entries.forEach(e => { if (!e.category) e.category = currentType; });

    const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
    const doc  = resp.ok ? await resp.json() : { fields: {} };
    const data = fromFS(doc.fields || {});
    const records = data.records || [];

    const toMins = t => {
      if (!t) return -1;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };

    // Rename display names → scheduler names so BC matching + records align
    const MSG_TO_SCHEDULER = {
      'Pause Subscription Message':                       'Paid_Pause_Reminder',
      'Unpause Subscription Message':                     'Paid_Unpause_Reminder',
      'PAID Combined Absent & Night Reminder':            'Paid_Night_Absent_Reminder',
      'PAID Combined Present & Night Reminder':           'Paid_Night_Present_Reminder',
      'Sunday Attendance Summary':                        'Paid_Sunday_Attendance',
      'PAID Hindi Combined Absent & Night Reminder':      'Paid_Hindi_Night_Absent_Reminder',
      'PAID Hindi Combined Present & Night Reminder':     'Paid_Hindi_Night_Present_Reminder',
      'Hindi Sunday Attendance Summary':                  'Paid_Hindi_Sunday_Attendance',
    };
    entries.forEach(e => { if (MSG_TO_SCHEDULER[e.msgname]) e.msgname = MSG_TO_SCHEDULER[e.msgname]; });

    // Match each entry to a scheduled broadcast so dashboard scheduler auto-marks done
    const broadcasts   = data.broadcasts || [];
    const curMins      = toMins(time);
    const usedBcIds    = new Set();

    entries.forEach(entry => {
      // Find best matching broadcast: same category + exact name (case-insensitive) + closest time within 90 min
      const bc = broadcasts
        .filter(b =>
          b.category === entry.category &&
          !usedBcIds.has(b.id) &&
          b.msgname.toLowerCase() === entry.msgname.toLowerCase() &&
          (!b.time || Math.abs(toMins(b.time) - curMins) <= 90)
        )
        .sort((a, b_) => {
          const da = a.time ? Math.abs(toMins(a.time) - curMins) : 999;
          const db = b_.time ? Math.abs(toMins(b_.time) - curMins) : 999;
          return da - db;
        })[0];

      if (bc) {
        usedBcIds.add(bc.id);
        entry.msgname  = bc.msgname;  // use exact scheduler name
        entry._bcTime  = bc.time;     // use scheduled time so findRecord() always matches
      }
    });

    entries.forEach(entry => {
      const recordTime = entry._bcTime || time;
      const idx = records.findIndex(r =>
        r.date === today &&
        r.msgname === entry.msgname &&
        Math.abs(toMins(r.time) - toMins(recordTime)) <= 20
      );
      const tplNow = document.getElementById('paidTemplate')?.value || 'standard';
      const rec = {
        id:       idx >= 0 ? records[idx].id : Date.now() + Math.random(),
        date:     today,
        time:     recordTime,
        category: currentType,
        subtype:  currentType === 'FREE' ? 'FREE' : detectSubtype(entry.msgname, tplNow),
        msgname:  entry.msgname,
        sent:     entry.sent,
        expected: entry.expected,
        diff:     entry.diff
      };
      if (idx >= 0) records[idx] = rec;
      else records.push(rec);
    });

    const saveResp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: toFS({ ...data, records }).mapValue.fields })
    });

    if (!saveResp.ok) throw new Error('Save failed');
    const n = entries.length;
    showFeedback(`✅ Copied & Saved! (${n} record${n > 1 ? 's' : ''})`, 'success');

    // Fire-and-forget to Google Sheet
    postToSheet(entries, today, time);
  } catch(e) {
    showFeedback('❌ Save error: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════
// GOOGLE SHEET SYNC (fire-and-forget)
// ══════════════════════════════════════════════
async function postToSheet(entries, date, fallbackTime) {
  try {
    const stored = await new Promise(r => chrome.storage.local.get(['sheetScriptUrl'], r));
    const url = (stored.sheetScriptUrl || '').trim();
    if (!url.startsWith('https://script.google.com/')) return;

    const payload = entries
      .filter(e => (parseInt(e.sent) || 0) > 0)
      .map(e => ({ msgname: e.msgname, sent: e.sent, _bcTime: e._bcTime || fallbackTime || null, date }));

    if (!payload.length) return;

    const resp = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify({ entries: payload })
    });
    const result = await resp.json().catch(() => null);
    if (result && result.updated > 0) {
      const d = result.debug?.[0];
      const info = d ? ` → R${d.row} C${d.col} | ${d.rowName} | ${d.rowTime} | ${d.colHeader}` : '';
      showFeedback(`✅ Sheet updated!${info}`, 'success');
      console.log('[Sheet]', JSON.stringify(result.debug));
    } else if (result && result.updated === 0) {
      showFeedback('⚠️ Sheet: row/date not found', 'error');
    }
  } catch(_) {
    // fire-and-forget — silently ignore errors
  }
}

// ══════════════════════════════════════════════
// EXTRACT FROM PAGE
// ══════════════════════════════════════════════
async function extractFromPage() {
  showFeedback('⏳ Extracting...', 'info');

  // Step 1: live scan of the current page (works if Stats modal is still open)
  let liveData = {};
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('habuild.in')) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const clean = s => (s || '').replace(/,/g, '');
          const text  = document.body?.innerText || '';
          const sent  = text.match(/Total Provider Sent\s*[:\-]?\s*([\d,]+)/i) ||
                        text.match(/Provider Sent\s*[:\-]?\s*([\d,]+)/i)       ||
                        text.match(/Total Sent\s*[:\-]?\s*([\d,]+)/i)           ||
                        text.match(/Messages? Sent\s*[:\-]?\s*([\d,]+)/i)       ||
                        text.match(/Sent\s*:\s*([\d,]+)/i);
          const exp   = text.match(/Total System Initialized[^:\n]*[:\-]?\s*([\d,]+)/i) ||
                        text.match(/System Initialized[^:\n]*[:\-]?\s*([\d,]+)/i)       ||
                        text.match(/Expected\s*[:\-]?\s*([\d,]+)/i)                      ||
                        text.match(/Initialized[^:\n]*[:\-]?\s*([\d,]+)/i);
          return {
            sentCount:     sent ? clean(sent[1]) : '',
            expectedCount: exp  ? clean(exp[1])  : '',
          };
        }
      });
      liveData = results[0]?.result || {};
    }
  } catch(_) {}

  // Step 2: merge with stored autoExtracted (has campaignName, category, etc.)
  const stored = await new Promise(r => chrome.storage.local.get(['autoExtracted'], r));
  const base   = stored.autoExtracted || {};

  const baseAge = Date.now() - (base.extractedAt || 0);
  // If stored data is older than 3 minutes, don't use its campaignName/hint for template detection
  const useBase = baseAge < 180000;

  const data = useBase
    ? { ...base,
        sentCount:     liveData.sentCount     || base.sentCount     || '',
        expectedCount: liveData.expectedCount || base.expectedCount || '',
        extractedAt:   Date.now() }
    : { sentCount:     liveData.sentCount     || '',
        expectedCount: liveData.expectedCount || '',
        category:      base.category || 'PAID',
        extractedAt:   Date.now() };

  if (!data.sentCount && !data.campaignName) {
    showFeedback('ℹ️ Stats button click karo page pe, phir try karo', 'info');
    return;
  }

  fillFields(data);
  showFeedback('✅ Fields fill ho gaye!', 'success');
}

async function fillFields(data) {
  if (data.category) setType(data.category);

  // Derive the time the Stats button was clicked — used for closest-time yesterday match
  const timeStr = data.extractedAt
    ? new Date(data.extractedAt).toTimeString().slice(0, 5)
    : new Date().toTimeString().slice(0, 5);

  if (currentType === 'FREE') {
    if (data.campaignName)  setVal('campaignName',  data.campaignName);
    if (data.sentCount)     setVal('sentCount',     data.sentCount);
    if (data.expectedCount) setVal('expectedCount', data.expectedCount);
    if (data.cid)           setVal('challengeId',   data.cid);
    if (data.wati)          setVal('watiSelFree',   data.wati);
    if (data.yesterdayCount) {
      setVal('yesterdayCount', data.yesterdayCount);
    } else if (data.campaignName) {
      showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
      const yest = await fetchYesterdayCount(data.campaignName, timeStr);
      if (yest !== null) { setVal('yesterdayCount', String(yest)); showFeedback('✅ Yesterday count aaya!', 'success'); }
      else showFeedback('ℹ️ Yesterday nahi mila — manually dalo', 'info');
    }
  } else {
    // Auto-detect template from card hint + campaign name + time
    const detected = autoDetectTemplate(data);
    if (detected) {
      const tplEl = document.getElementById('paidTemplate');
      if (tplEl) {
        const changed = tplEl.value !== detected;
        tplEl.value = detected;
        if (changed) clearTemplateFields(detected); // clear old counts when switching template
        onTemplateChange();
      }
    }

    const tpl = document.getElementById('paidTemplate')?.value || 'standard';

    if (tpl === 'standard' || tpl === 'simple') {
      // Fresh extract — reset to single row
      paidCamps = [{
        name:     data.campaignName  || '',
        sent:     data.sentCount     || '',
        expected: data.expectedCount || ''
      }];
      renderCampRows();
      updateTotal();
      // Yesterday count
      if (data.yesterdayCount) {
        setVal('paidYestCount', data.yesterdayCount);
      } else if (data.campaignName) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayCount(data.campaignName, timeStr);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback('✅ Yesterday count aaya!', 'success'); }
        else showFeedback('ℹ️ Yesterday nahi mila — manually dalo', 'info');
      }
    } else if (tpl === 'pause') {
      // If pauseSent is already filled → go to unpause slot, else start from pause
      if (!val('pauseSent') || !val('unpauseSent')) {
        if (!val('pauseSent')) {
          if (data.sentCount)     setVal('pauseSent',     data.sentCount);
          if (data.expectedCount) setVal('pauseExpected', data.expectedCount);
          showFeedback('✅ Pause slot fill hua!', 'success');
        } else {
          if (data.sentCount)     setVal('unpauseSent',     data.sentCount);
          if (data.expectedCount) setVal('unpauseExpected', data.expectedCount);
          showFeedback('✅ Unpause slot fill hua!', 'success');
        }
      } else {
        // Both filled — fresh start from pause
        setVal('pauseSent',       data.sentCount     || '');
        setVal('pauseExpected',   data.expectedCount || '');
        setVal('unpauseSent',     '');
        setVal('unpauseExpected', '');
        showFeedback('✅ Pause slot fill hua (reset)!', 'success');
      }
    } else if (tpl === 'renewal_minus') {
      const slots  = ['renewX1','renewX2','renewX3'];
      const labels = ['X-1','X-2','X-3'];
      // Find first empty slot; if all filled → reset and start over
      let idx = slots.findIndex(s => !val(s));
      if (idx < 0) { slots.forEach(s => setVal(s, '')); idx = 0; }
      if (data.sentCount) {
        setVal(slots[idx], data.sentCount);
        showFeedback(`✅ ${labels[idx]} fill hua!`, 'success');
      }
    } else if (tpl === 'renewal_plus') {
      const slots  = ['renewX','renewXp1','renewXp2','renewXp3'];
      const labels = ['X','X+1','X+2','X+3'];
      let idx = slots.findIndex(s => !val(s));
      if (idx < 0) { slots.forEach(s => setVal(s, '')); idx = 0; }
      if (data.sentCount) {
        setVal(slots[idx], data.sentCount);
        showFeedback(`✅ ${labels[idx]} fill hua!`, 'success');
      }
    } else if (tpl === 'attendance') {
      const n = (data.campaignName || '').toLowerCase();
      let sId, eId, label;
      if (n.includes('milestone'))                              { sId='att2Sent'; eId='att2Exp'; label='Milestone'; }
      else if (n.includes('hindi'))                             { sId='att3Sent'; eId='att3Exp'; label='Hindi Att'; }
      else                                                      { sId='att1Sent'; eId='att1Exp'; label='Attendance'; }
      if (data.sentCount)     setVal(sId, data.sentCount);
      if (data.expectedCount) setVal(eId, data.expectedCount);
      if (!val('paidYestCount')) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayTotal('attendance', timeStr);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback(`✅ ${label} slot fill hua!`, 'success'); }
        else showFeedback(`✅ ${label} slot fill hua! (Yesterday manually dalo)`, 'info');
      } else {
        showFeedback(`✅ ${label} slot fill hua!`, 'success');
      }
    } else if (tpl === 'reminder') {
      const n = (data.campaignName || '').toLowerCase();
      let sId, eId, label;
      if (n.includes('hindi'))  { sId='remHindiSent'; eId='remHindiExp'; label='Hindi Reminder'; }
      else                      { sId='remYESent';    eId='remYEExp';    label='YE Reminder'; }
      if (data.sentCount)     setVal(sId, data.sentCount);
      if (data.expectedCount) setVal(eId, data.expectedCount);
      if (!val('paidYestCount')) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayTotal('reminder', timeStr);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback(`✅ ${label} slot fill hua!`, 'success'); }
        else showFeedback(`✅ ${label} slot fill hua! (Yesterday manually dalo)`, 'info');
      } else {
        showFeedback(`✅ ${label} slot fill hua!`, 'success');
      }
    } else if (tpl === 'night') {
      const n = (data.campaignName || '').toLowerCase();
      const slots = [
        { sId:'nightAbsentSent',  eId:'nightAbsentExp',  label:'Absent'  },
        { sId:'nightPresentSent', eId:'nightPresentExp', label:'Present' },
        { sId:'nightSundaySent',  eId:'nightSundayExp',  label:'Sunday'  },
      ];
      let slot = n.includes('sunday') ? slots[2]
               : n.includes('absent') ? slots[0]
               : n.includes('present') ? slots[1]
               : (slots.find(s => !val(s.sId)) || slots[0]);
      if (data.sentCount)     setVal(slot.sId, data.sentCount);
      if (data.expectedCount) setVal(slot.eId, data.expectedCount);
      if (!val('paidYestCount')) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayTotal('night', timeStr, false);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success'); }
        else showFeedback(`✅ Night ${slot.label} slot fill hua! (Yesterday manually dalo)`, 'info');
      } else {
        showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success');
      }
    } else if (tpl === 'night_hindi') {
      const n = (data.campaignName || '').toLowerCase();
      const slots = [
        { sId:'nightHindiAbsentSent',  eId:'nightHindiAbsentExp',  label:'Hindi Absent'  },
        { sId:'nightHindiPresentSent', eId:'nightHindiPresentExp', label:'Hindi Present' },
        { sId:'nightHindiSundaySent',  eId:'nightHindiSundayExp',  label:'Hindi Sunday'  },
      ];
      let slot = n.includes('sunday') ? slots[2]
               : n.includes('absent') ? slots[0]
               : n.includes('present') ? slots[1]
               : (slots.find(s => !val(s.sId)) || slots[0]);
      if (data.sentCount)     setVal(slot.sId, data.sentCount);
      if (data.expectedCount) setVal(slot.eId, data.expectedCount);
      if (!val('paidYestCount')) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayTotal('night', timeStr, true);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success'); }
        else showFeedback(`✅ Night ${slot.label} slot fill hua! (Yesterday manually dalo)`, 'info');
      } else {
        showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success');
      }
    }
  }

  document.getElementById('preview').dataset.userEdited = 'false';
  updatePreview();
}

// ── MONDAY → SATURDAY, else YESTERDAY ────────
function getPrevDate() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 1 ? 2 : 1));
  return d.toISOString().slice(0, 10);
}
function getPrevLabel() {
  return new Date().getDay() === 1 ? "Saturday's Count" : "Yesterday's Count";
}

// ── FETCH YESTERDAY TOTAL (sum records by subtype + time window ±30 min) ─
// hindiOnly: true = only Hindi records, false = only non-Hindi, null = all
async function fetchYesterdayTotal(subtype, currentTimeStr, hindiOnly = null) {
  try {
    const yDate = getPrevDate();
    const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
    if (!resp.ok) return null;
    const doc  = await resp.json();
    const data = fromFS(doc.fields || {});
    const toMins = t => { if (!t) return -1; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const curMins = toMins(currentTimeStr);
    const matchesHindi = r => (r.msgname || '').toLowerCase().includes('hindi');
    const records = (data.records || []).filter(r => {
      if (r.date !== yDate || !r.time) return false;
      const diff = Math.abs(toMins(r.time) - curMins);
      if (r.subtype === subtype && diff <= 30) {
        if (hindiOnly !== null && matchesHindi(r) !== hindiOnly) return false;
        return true;
      }
      // fallback for reminder records saved with wrong subtype (e.g. 'yoga')
      if (subtype === 'reminder' &&
          (r.msgname || '').toLowerCase().includes('reminder') &&
          !(r.msgname || '').toLowerCase().includes('night') &&
          diff <= 20) return true;
      return false;
    });
    if (!records.length) return null;
    return records.reduce((sum, r) => sum + (parseInt(r.sent) || 0), 0);
  } catch(e) {
    return null;
  }
}

// ── FETCH YESTERDAY COUNT (closest time match) ─
async function fetchYesterdayCount(msgname, currentTimeStr) {
  try {
    const yDate = getPrevDate();
    const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
    if (!resp.ok) return null;
    const doc  = await resp.json();
    const data = fromFS(doc.fields || {});
    const toMins = t => { if (!t) return -1; const [h,m] = t.split(':').map(Number); return h*60+(m||0); };
    const norm = s => (s||'').toLowerCase().trim();
    const matches = (data.records || []).filter(r => r.date === yDate && norm(r.msgname) === norm(msgname));

    if (!matches.length && currentTimeStr) {
      // Name changed day-to-day — fall back to same-time window (±30 min)
      const cur = toMins(currentTimeStr);
      const timeMatches = (data.records || []).filter(r =>
        r.date === yDate && r.time && Math.abs(toMins(r.time) - cur) <= 30
      );
      if (timeMatches.length === 1) return timeMatches[0].sent;
      return null;
    }
    if (!matches.length) return null;
    if (matches.length === 1 || !currentTimeStr) return matches[0].sent;

    // Multiple records for same name — pick the one closest in time
    const cur = toMins(currentTimeStr);
    const best = matches.reduce((a, b) =>
      Math.abs(toMins(a.time) - cur) <= Math.abs(toMins(b.time) - cur) ? a : b
    );
    return best.sent;
  } catch(e) {
    return null;
  }
}

// ══════════════════════════════════════════════
// FIRESTORE WIRE FORMAT
// ══════════════════════════════════════════════
function fromFS(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fromFSVal(v);
  return obj;
}
function fromFSVal(v) {
  if ('nullValue'    in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('stringValue'  in v) return v.stringValue;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fromFSVal);
  if ('mapValue'     in v) return fromFS(v.mapValue.fields || {});
  return null;
}
function toFS(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string')  return { stringValue: val };
  if (Array.isArray(val))       return { arrayValue: { values: val.map(toFS) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) if (v !== undefined) fields[k] = toFS(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// ══════════════════════════════════════════════
// SCAN PAGE
// ══════════════════════════════════════════════
function scanPage() {
  showScanStatus('⏳ Scanning...', 'info');
  chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
    const tab = tabs[0];
    if (!tab) { showScanStatus('❌ Tab nahi mila', 'error'); return; }
    if (!tab.url || !tab.url.includes('habuild.in')) {
      showScanStatus('❌ Pehle admin panel kholo: admin-panel.habuild.in', 'error');
      return;
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const statsButtons = [...document.querySelectorAll('button')]
            .filter(b => b.textContent.trim() === 'Stats');
          const nameSet = new Set();
          let detectedType = 'PAID';
          const campaigns = [];
          statsButtons.forEach(btn => {
            const card = btn.closest('div.p-4');
            if (!card) return;
            const text = card.innerText || card.textContent || '';
            if (/\bDisabled\b/i.test(text)) return;
            const nameEl = card.querySelector('span.text-sm.font-semibold') ||
                           card.querySelector('[class*="font-semibold"]');
            const name = nameEl ? nameEl.textContent.replace(/Campaign\s*Name\s*:/i,'').trim() : '';
            if (/clone/i.test(name)) return;
            const isFree = !!card.querySelector('[class*="bg-green"]');
            if (isFree) detectedType = 'FREE';
            const cidMatch  = text.match(/(?:Challenge[_\s]*|CID\s*)(\d+)/i);
            const watiMatch = text.match(/wati\s+(\d+)/i);
            const cid  = cidMatch  ? cidMatch[1]           : '';
            const wati = watiMatch ? 'wati ' + watiMatch[1]: '';
            const timeMatch = text.match(/Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
            const time = timeMatch ? timeMatch[1].trim() : '';
            const isHourly = name.toLowerCase().includes('hourly');
            const dedupeKey = (isHourly && time) ? `HOURLY_${time}` : (name || cid);
            if (dedupeKey) nameSet.add(dedupeKey);
            campaigns.push({ type: isFree ? 'FREE' : 'PAID', name, cid, wati, time, isHourly });
          });
          return {
            detectedType,
            uniqueCidCount: nameSet.size,
            freeCount: detectedType === 'FREE' ? nameSet.size : 0,
            paidCount: detectedType === 'PAID' ? nameSet.size : 0,
            campaigns,
            total: statsButtons.length
          };
        }
      });
      const response = results[0]?.result;
      if (!response) { showScanStatus('❌ Scan result nahi aaya', 'error'); return; }
      lastScanData = response;
      document.getElementById('paidNum').textContent = response.paidCount;
      document.getElementById('freeNum').textContent = response.freeCount;
      const list = document.getElementById('campaignList');
      if (!response.campaigns.length) {
        list.innerHTML = '<div class="camp-item">Koi campaign nahi mila</div>';
      } else {
        const seen = new Set();
        list.innerHTML = response.campaigns.map(c => {
          const key = (c.isHourly && c.time) ? `HOURLY_${c.time}` : (c.name || c.cid);
          const isDupe = key && seen.has(key);
          if (key) seen.add(key);
          return `<div class="camp-item" style="${isDupe ? 'opacity:.45' : ''}">
            <span class="camp-badge ${c.type}">${c.type}</span>
            ${c.time ? `<span style="color:#0ea5e9;font-size:.75rem;font-weight:600">${c.time}</span>` : ''}
            <span>${c.name || '(no name)'}</span>
            ${c.cid ? `<span style="color:#64748b;font-size:.72rem">CID ${c.cid}</span>` : ''}
            ${isDupe ? `<span style="color:#ef4444;font-size:.72rem">duplicate</span>` : ''}
          </div>`;
        }).join('');
      }
      document.getElementById('scanResult').style.display = 'block';
      showScanStatus(`✅ ${response.detectedType} | ${response.uniqueCidCount} unique (${response.total} total)`, 'success');
    } catch(e) {
      showScanStatus('❌ Error: ' + e.message, 'error');
    }
  });
}

// ══════════════════════════════════════════════
// SAVE SCAN TO DASHBOARD
// ══════════════════════════════════════════════
async function saveToDashboard() {
  if (!lastScanData) return;
  const today = new Date().toISOString().slice(0, 10);
  showScanStatus('⏳ Saving...', 'info');
  try {
    const resp = await fetch(`${FS_URL}/todayStats/${today}?key=${API_KEY}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: toFS({
        date: today,
        paidCount: lastScanData.paidCount,
        freeCount: lastScanData.freeCount,
        campaigns: lastScanData.campaigns,
        savedAt:   new Date().toISOString()
      }).mapValue.fields })
    });
    if (!resp.ok) throw new Error('Save failed');
    showScanStatus('✅ Dashboard mein save ho gaya!', 'success');
  } catch(e) {
    showScanStatus('❌ Error: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════
function toggleDark() {
  const isDark = document.body.classList.toggle('dark');
  document.getElementById('darkBtn').textContent = isDark ? '☀️' : '🌙';
  chrome.storage.local.set({ darkMode: isDark });
}

// ══════════════════════════════════════════════
// DATA PERSISTENCE
// ══════════════════════════════════════════════
function saveData() {
  const data = { type: currentType };
  FREE_FIELDS.forEach(f => { data[f] = val(f); });
  PAID_STATIC.forEach(f => {
    const el = document.getElementById(f);
    if (el) data[f] = el.value;
  });
  data.paidCamps = paidCamps;
  chrome.storage.local.set({ formData: data });
}

function loadSavedData() {
  chrome.storage.local.get(['formData', 'darkMode', 'autoExtracted', 'sheetScriptUrl'], r => {
    if (r.sheetScriptUrl) setVal('sheetScriptUrl', r.sheetScriptUrl);
    if (r.darkMode) {
      document.body.classList.add('dark');
      document.getElementById('darkBtn').textContent = '☀️';
    }
    if (r.formData) {
      const d = r.formData;
      // Restore type directly (avoid triggering saveData mid-restore)
      currentType = d.type || 'PAID';
      document.getElementById('typeFree').classList.toggle('active', currentType === 'FREE');
      document.getElementById('typePaid').classList.toggle('active', currentType === 'PAID');
      document.getElementById('freeFields').style.display = currentType === 'FREE' ? 'flex' : 'none';
      document.getElementById('paidFields').style.display = currentType === 'PAID' ? 'flex' : 'none';
      // Restore field values
      FREE_FIELDS.forEach(f => { if (d[f] !== undefined) setVal(f, d[f]); });
      PAID_STATIC.forEach(f => {
        if (d[f] !== undefined) { const el = document.getElementById(f); if (el) el.value = d[f]; }
      });
      if (d.paidCamps && d.paidCamps.length) paidCamps = d.paidCamps;
    }
    // Render everything correctly
    onTemplateChange();

    // Auto-fill only if Stats was clicked within last 2 minutes
    const freshExtract = r.autoExtracted && (Date.now() - r.autoExtracted.extractedAt < 120000);
    // Wipe stale autoExtracted (>10 min) so it can't pollute future extracts
    if (r.autoExtracted && !freshExtract && Date.now() - r.autoExtracted.extractedAt > 600000) {
      chrome.storage.local.remove(['autoExtracted']);
    }
    if (freshExtract) {
      fillFields(r.autoExtracted);
      const msg = document.getElementById('autoMsg');
      msg.textContent = '✅ Auto-extracted values from Stats!';
      msg.style.display = 'block';
    }
  });
}

// ══════════════════════════════════════════════
// FEEDBACK
// ══════════════════════════════════════════════
function showFeedback(msg, type) {
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.className = 'feedback ' + type;
  if (msg) setTimeout(() => { el.textContent = ''; el.className = 'feedback'; }, 3000);
}

function showScanStatus(msg, type) {
  const el = document.getElementById('scanStatus');
  el.textContent = msg;
  el.className = 'feedback ' + type;
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function val(id)       { const el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  document.getElementById('tab-send').addEventListener('click', () => switchTab('send'));
  document.getElementById('tab-scan').addEventListener('click', () => switchTab('scan'));
  document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const url = document.getElementById('sheetScriptUrl').value.trim();
    chrome.storage.local.set({ sheetScriptUrl: url }, () => {
      const fb = document.getElementById('settingsFeedback');
      fb.textContent = '✅ Saved!'; fb.className = 'feedback success';
      setTimeout(() => { fb.textContent = ''; fb.className = 'feedback'; }, 2000);
    });
  });

  document.getElementById('testSheetBtn').addEventListener('click', async () => {
    const url = document.getElementById('sheetScriptUrl').value.trim();
    const fb  = document.getElementById('settingsFeedback');
    if (!url.startsWith('https://script.google.com/')) {
      fb.textContent = '❌ Valid script URL dalo'; fb.className = 'feedback error'; return;
    }
    fb.textContent = '⏳ Testing...'; fb.className = 'feedback info';
    try {
      const today = new Date().toISOString().slice(0, 10);
      await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ entries: [{ msgname: 'TEST', sent: 0, _bcTime: null, date: today }] })
      });
      fb.textContent = '✅ Script connected!'; fb.className = 'feedback success';
    } catch(e) {
      fb.textContent = '❌ Error: ' + e.message; fb.className = 'feedback error';
    }
    setTimeout(() => { fb.textContent = ''; fb.className = 'feedback'; }, 3000);
  });

  // Type toggle
  document.getElementById('typeFree').addEventListener('click', () => setType('FREE'));
  document.getElementById('typePaid').addEventListener('click', () => setType('PAID'));

  // Template & WATI change
  document.getElementById('paidTemplate').addEventListener('change', onTemplateChange);
  document.getElementById('paidWati').addEventListener('change', () => { updatePreview(); saveData(); });

  // Action buttons
  document.getElementById('extractBtn').addEventListener('click', extractFromPage);
  document.getElementById('copyBtn').addEventListener('click', copyMsg);
  document.getElementById('copyAndSaveBtn').addEventListener('click', copyAndSave);
  document.getElementById('whatsappBtn').addEventListener('click', sendWhatsApp);
  document.getElementById('darkBtn').addEventListener('click', toggleDark);
  document.getElementById('reloadBtn').addEventListener('click', () => chrome.runtime.reload());
  document.getElementById('scanBtn').addEventListener('click', scanPage);
  document.getElementById('saveBtn').addEventListener('click', saveToDashboard);
  document.getElementById('addCampBtn').addEventListener('click', addCamp);

  // Preview user-edit detection (reset on typing)
  document.getElementById('preview').addEventListener('input', () => {
    document.getElementById('preview').dataset.userEdited = 'true';
  });

  // FREE field change listeners
  FREE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, updatePreview);
  });

  // PAID static field change listeners
  ['pauseSent','pauseExpected','unpauseSent','unpauseExpected',
   'renewX1','renewX2','renewX3','renewX','renewXp1','renewXp2','renewXp3',
   'remYESent','remYEExp','remHindiSent','remHindiExp',
   'nightAbsentSent','nightAbsentExp','nightPresentSent','nightPresentExp',
   'nightSundaySent','nightSundayExp',
   'nightHindiAbsentSent','nightHindiAbsentExp','nightHindiPresentSent','nightHindiPresentExp',
   'nightHindiSundaySent','nightHindiSundayExp',
   'att1Sent','att1Exp','att2Sent','att2Exp','att3Sent','att3Exp',
   'paidYestCount','simpleTimePrefix','simpleNote'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { updatePreview(); saveData(); });
  });
  ['attendBatch','att3Wati','remBatch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { updatePreview(); saveData(); });
  });

  // Auto-reinject content.js if extension was reloaded (tab not refreshed)
  chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
    const tab = tabs[0];
    if (tab?.url?.includes('habuild.in')) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      } catch(_) {}
    }
  });

  // Initial render
  loadSavedData();
});
