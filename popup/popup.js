// ── FIREBASE CONFIG ───────────────────────────
const API_KEY = 'AIzaSyAj5m1-NUOhaptk4Q26dqPKr537MFFobmk';
const PROJECT = 'dashbordpublic';
const FS_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── STATE ─────────────────────────────────────
let currentType = 'PAID';
let lastScanData = null;
let paidCamps = [{name:'', sent:'', expected:'', wati:'all WATIs'}];
let freeBroadcasts = [{ cid:'', type:'Evening Message', batch:'1st batch', day:'normal', wati:'', sent:'', expected:'', yest:'' }];
let lastBcTime  = null; // broadcast time extracted from admin panel card
let lastSheetRows = ''; // row names updated in last postToSheet call
let lastBcDate  = null; // broadcast date extracted from admin panel card ("YYYY-MM-DD")
let adminName   = '';  // set in Settings → stamped on every record
// Tracks which slots have been filled — cleared only by Reload or Copy&Save
const filledSlots = new Set();

// ── FIELD LISTS ───────────────────────────────
const FREE_FIELDS = []; // free broadcasts stored as freeBroadcasts array, not individual fields
const PAID_STATIC = ['paidTemplate','paidWati','simpleTimePrefix','simpleNote',
  'pauseSent','pauseExpected','unpauseSent','unpauseExpected',
  'renewX1','renewX2','renewX3','renewX','renewXp1','renewXp2','renewXp3',
  'remBatch','remYESent','remYEExp','remHindiSent','remHindiExp',
  'nightPresentSent','nightPresentExp','nightAbsentSent','nightAbsentExp',
  'nightHindiPresentSent','nightHindiPresentExp','nightHindiAbsentSent','nightHindiAbsentExp',
  'nightSundaySent','nightSundayExp','nightHindiSundaySent','nightHindiSundayExp',
  'attendBatch','att1Sent','att1Exp','att2Sent','att2Exp','att3Sent','att3Exp','att3Wati',
  'sunAttSent','sunAttExp','sunMilSent','sunMilExp','sunHindiSent','sunHindiExp',
  'paidYestCount',
  'extraSubType','extraWaterTime','extraWaterWati','extraWaterSent','extraWaterYest',
  'extraEmailTime','extraEmailBatch','extraEmailSent','extraEmailExp','extraEmailYest',
  'extraSEBatch','extraSESent','extraSEWati'];

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
  else { renderFreeRows(); updatePreview(); }
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
  const isSunday  = tpl === 'sunday';
  const isRemind  = tpl === 'reminder';
  const isNight      = tpl === 'night';
  const isNightHindi = tpl === 'night_hindi';
  const isExtra   = tpl === 'extra_session';

  showEl('campRowsWrap',     isStd || isSimple);
  showEl('addCampBtn',       isStd);
  showEl('simplePrefixWrap', false);
  showEl('pauseWrap',        isPause,        true);
  showEl('renewalWrap',      isRenewal,      true);
  showEl('reminderWrap',     isRemind,       true);
  showEl('nightWrap',        isNight,        true);
  showEl('nightHindiWrap',   isNightHindi,   true);
  showEl('attendWrap',       isAttend,       true);
  showEl('sundayWrap',       isSunday,       true);
  showEl('extraWrap',        isExtra,        true);
  showEl('paidTotalWrap',    isStd || isAttend || isRemind || isNight || isNightHindi || isSunday);
  showEl('paidYestWrap',     !isPause && !isRenewal && !isExtra);

  if (isSunday) {
    const el = document.getElementById('sundayTimeDisplay');
    if (el) {
      if (lastBcTime) {
        const [hh, mm] = lastBcTime.split(':');
        let h = parseInt(hh);
        const ampm = h >= 12 ? 'PM' : 'AM';
        if (h > 12) h -= 12; else if (h === 0) h = 12;
        el.textContent = `📅 Broadcast time: ${h}:${mm} ${ampm}`;
      } else {
        el.textContent = '⚠️ Stats card click karo (time auto-detect hoga)';
      }
    }
  }

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

function onExtraTypeChange() {
  const type = document.getElementById('extraSubType')?.value || 'water';
  ['extraWaterWrap','extraEmailWrap','extraSEWrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const show = type === 'water' ? 'extraWaterWrap' : type === 'email' ? 'extraEmailWrap' : 'extraSEWrap';
  const el = document.getElementById(show);
  if (el) el.style.display = 'flex';
  updatePreview();
  saveData();
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

// ── FREE BROADCAST ROWS ────────────────────────
function getWatiFromCid(cid) {
  const n = parseInt(cid) || 0;
  if (n >= 4000) return 'wati 9';
  if (n >= 2000) return 'wati 14';
  return 'all free WATIs';
}

function getMsgTimeType() {
  return new Date().getHours() < 14 ? 'Morning Message' : 'Evening Message';
}

function formatTimePrefix(hhmm) {
  const m = (hhmm || '').match(/^(\d+):(\d+)/);
  if (!m) return '';
  let h = parseInt(m[1]); const min = parseInt(m[2]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12; else if (h === 0) h = 12;
  return min === 0 ? `${h}${ampm}` : `${h}:${String(min).padStart(2,'0')}${ampm}`;
}

function renderFreeRows() {
  const container = document.getElementById('freeRows');
  if (!container) return;
  const TYPE_ICON = {
    'Morning Message':'🌅','Evening Message':'🌙','Attendance':'📋',
    'Bonus':'🎁','Orientation':'📚','Quiz':'📝',
    'Night Present':'🌟','Night Absent':'🌑','Payment':'💳'
  };
  const TYPES = Object.keys(TYPE_ICON);
  const showRM = freeBroadcasts.length > 1;

  container.innerHTML = freeBroadcasts.map((fb, i) => {
    const isAtt      = fb.type === 'Attendance';
    const isEveOrMorn = fb.type === 'Morning Message' || fb.type === 'Evening Message';
    const watiVal    = fb.wati || getWatiFromCid(fb.cid) || '';
    const icon       = TYPE_ICON[fb.type] || '📣';
    const hdr        = fb.cid ? `${icon} ${fb.type} — CID ${fb.cid}` : `${icon} ${fb.type}`;
    return `
<div class="camp-row">
  <div class="camp-row-hdr">
    <span>${hdr}</span>
    ${showRM ? `<button class="camp-rm" data-action="remove" data-idx="${i}">✕</button>` : ''}
  </div>
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
    <div class="row2">
      <div class="field"><label>CID</label>
        <input type="number" placeholder="2008" value="${fb.cid}" data-idx="${i}" data-field="cid">
      </div>
      <div class="field"><label>Type</label>
        <select data-idx="${i}" data-field="type">
          ${TYPES.map(t=>`<option value="${t}"${fb.type===t?' selected':''}>${TYPE_ICON[t]} ${t}</option>`).join('')}
        </select>
      </div>
    </div>
    ${isAtt ? `
    <div class="row2">
      <div class="field"><label>Batch</label>
        <select data-idx="${i}" data-field="batch">
          ${['1st batch','2nd batch','3rd batch'].map(b=>`<option${fb.batch===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Day</label>
        <select data-idx="${i}" data-field="day">
          ${['normal','Day 1','Day 3','Day 7','Day 14'].map(d=>`<option${fb.day===d?' selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}
    <div class="field"><label>WATI</label>
      <input type="text" placeholder="${watiVal||'wati 14'}" value="${watiVal}" data-idx="${i}" data-field="wati">
    </div>
    <div class="row2">
      <div class="field"><label>Sent</label>
        <input type="number" placeholder="0" value="${fb.sent||''}" data-idx="${i}" data-field="sent">
      </div>
      <div class="field"><label>Expected</label>
        <input type="number" placeholder="0" value="${fb.expected||''}" data-idx="${i}" data-field="expected">
      </div>
    </div>
    ${isEveOrMorn ? `
    <div class="field"><label>Yesterday</label>
      <input type="number" placeholder="0" value="${fb.yest||''}" data-idx="${i}" data-field="yest">
    </div>` : ''}
  </div>
</div>`;
  }).join('');
}

function removeFreeRow(i) {
  freeBroadcasts.splice(i, 1);
  if (!freeBroadcasts.length)
    freeBroadcasts = [{ cid:'', type: getMsgTimeType(), batch:'1st batch', day:'normal', wati:'', sent:'', expected:'', yest:'' }];
  renderFreeRows(); updatePreview(); saveData();
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
  } else if (tpl === 'sunday') {
    ['sunAttSent','sunAttExp','sunMilSent','sunMilExp','sunHindiSent','sunHindiExp'].forEach(f => setVal(f, ''));
  } else if (tpl === 'reminder') {
    ['remYESent','remYEExp','remHindiSent','remHindiExp'].forEach(f => setVal(f, ''));
    setVal('remBatch', '1st');
  } else if (tpl === 'night') {
    ['nightAbsentSent','nightAbsentExp','nightPresentSent','nightPresentExp',
     'nightSundaySent','nightSundayExp'].forEach(f => setVal(f, ''));
  } else if (tpl === 'night_hindi') {
    ['nightHindiAbsentSent','nightHindiAbsentExp','nightHindiPresentSent','nightHindiPresentExp',
     'nightHindiSundaySent','nightHindiSundayExp'].forEach(f => setVal(f, ''));
  } else if (tpl === 'extra_session') {
    ['extraWaterSent','extraWaterYest','extraEmailSent','extraEmailExp','extraEmailYest',
     'extraSESent'].forEach(f => setVal(f, ''));
  } else {
    paidCamps = [{name:'', sent:'', expected:'', wati:'all WATIs'}];
  }
  // Always clear yesterday count so next extract re-fetches for the new template
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
  if (isPause) return 'pause';
  // Sunday hourly attendance — check before night (night also matches sunday+attendance)
  if (hint === 'sunday' || (name.includes('sunday') && (name.includes('attendance') || name.includes('tracker') || name.includes('milestone'))))
    return 'sunday';
  // hint takes precedence for night_hindi — campaign name of Hindi absent card has no 'hindi'
  if (hint === 'night_hindi' || (name.includes('hindi') && (name.includes('night') || name.includes('consolidate') || name.includes('combined'))))
    return 'night_hindi';
  if (hint === 'night' || name.includes('night') || name.includes('consolidate') || name.includes('combined'))
    return 'night';
  if (name.includes('water'))
    return 'extra_session';
  if (name.includes('email') && name.includes('reminder'))
    return 'extra_session';
  if ((name.includes('_se') || name.includes('se_')) && name.includes('attendance'))
    return 'extra_session';
  if (hint === 'attendance' || name.includes('attendance') || name.includes('milestone') || name.includes('tracker'))
    return 'attendance';
  if (name.includes('_se') || name.includes('se_') || name.includes('strong'))
    return 'simple';
  if (hint === 'reminder' || name.includes('reminder'))
    return 'reminder';
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
    let msg   = '*UPDATE: ✅*';
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

  if (tpl === 'extra_session') {
    const sub = document.getElementById('extraSubType')?.value || 'water';
    if (sub === 'water') {
      const time = document.getElementById('extraWaterTime')?.value || '11:00 AM';
      const watiW = document.getElementById('extraWaterWati')?.value || 'all paid WATIs';
      const sent = parseInt(document.getElementById('extraWaterSent')?.value) || 0;
      const yestW = document.getElementById('extraWaterYest')?.value || '';
      let msg = `*UPDATE: ✅*\n\n*${time} Water reminder* sent to ${sent} users on ${watiW}`;
      if (yestW) msg += `\nYesterday's Count : ${yestW}`;
      return msg;
    }
    if (sub === 'email') {
      const batch = document.getElementById('extraEmailBatch')?.value || '1st';
      const sent  = parseInt(document.getElementById('extraEmailSent')?.value) || 0;
      const exp   = parseInt(document.getElementById('extraEmailExp')?.value) || 0;
      const diff  = exp > 0 ? Math.abs(exp - sent) : 0;
      const yestE = document.getElementById('extraEmailYest')?.value || '';
      let msg = `*UPDATE: ✅*\n\n${batch} Batch *Paid_YE_Email_Reminder* sent to ${sent} users.\nExpected: ${exp} Difference: ${diff}`;
      if (yestE) msg += `\nYesterday's Count : ${yestE}`;
      return msg;
    }
    if (sub === 'se') {
      const batch = document.getElementById('extraSEBatch')?.value || '1st';
      const sent  = parseInt(document.getElementById('extraSESent')?.value) || 0;
      const watiS = document.getElementById('extraSEWati')?.value || 'wati 28';
      return `*UPDATE: ✅*\n\n*PAID SE* ${batch} BATCH Attendance tracker sent to ${sent} users on ${watiS}`;
    }
    return '— Extra Session type select karo —';
  }

  if (tpl === 'simple') {
    const c    = paidCamps[0] || {};
    const name = c.name || '';
    const s    = parseInt(c.sent) || 0;
    let msg = `*UPDATE: ✅*\n\n${name ? '*' + name + '* sent' : 'sent'} to ${s} users on ${wati}.`;
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
    return `*UPDATE: ✅*\n\n*Pause Subscription Message* sent to ${pS} users on all paid WATIs\nExpected count: ${pE}\nDifference: ${Math.abs(pE - pS)}\n\n*Unpause Subscription Message* sent to ${uS} users on all paid WATIs\nExpected count: ${uE}\nDifference: ${Math.abs(uE - uS)}`;
  }

  if (tpl === 'renewal_minus') {
    const x1 = parseInt(val('renewX1')) || 0;
    const x2 = parseInt(val('renewX2')) || 0;
    const x3 = parseInt(val('renewX3')) || 0;
    return `*UPDATE: ✅*\n\n*Paid*\n*X-1 Renewal message* sent to ${x1} users on all WATIs.\n*X-2 Renewal message* sent to ${x2} users on all WATIs.\n*X-3 Renewal message* sent to ${x3} users on all WATIs.`;
  }

  if (tpl === 'renewal_plus') {
    const x  = parseInt(val('renewX'))   || 0;
    const x1 = parseInt(val('renewXp1')) || 0;
    const x2 = parseInt(val('renewXp2')) || 0;
    const x3 = parseInt(val('renewXp3')) || 0;
    return `*UPDATE: ✅*\n\n*Paid*\n*X Renewal message* sent to ${x} users on all WATIs.\n*X+1 Renewal message* sent to ${x1} users on all WATIs.\n*X+2 Renewal message* sent to ${x2} users on all WATIs.\n*X+3 Renewal message* sent to ${x3} users on all WATIs.`;
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
    let msg = '*UPDATE: ✅*', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\nPAID ${batch} BATCH *${s.name}* sent to ${sent} users on ${s.w}.`;
      msg += `\nExpected: ${exp} Difference: ${diff !== '' ? diff : 0}`;
      total += sent;
    });
    const el = document.getElementById('paidTotal');
    if (el) el.value = total || '';
    msg += `\n\nTotal count: ${total.toLocaleString()}`;
    if (yest) msg += `\n${yestLabel}: ${yest}`;
    return msg;
  }

  if (tpl === 'sunday') {
    // Build "H PM" time label from lastBcTime
    let timeLabel = '';
    if (lastBcTime) {
      const [hh, mm] = lastBcTime.split(':');
      let h = parseInt(hh);
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12; else if (h === 0) h = 12;
      timeLabel = `${h} ${ampm}`;
    }
    const slots = [
      { name: 'Sunday Attendance tracker',       sId: 'sunAttSent',   eId: 'sunAttExp'   },
      { name: 'Sunday Milestone tracker',        sId: 'sunMilSent',   eId: 'sunMilExp'   },
      { name: 'Hindi Sunday Attendance tracker', sId: 'sunHindiSent', eId: 'sunHindiExp' },
    ];
    const rows = slots.filter(s => parseInt(val(s.sId)) > 0);
    if (!rows.length) return '— Sunday Attendance counts bharo —';
    let msg = `*UPDATE: ✅*${timeLabel ? ' *' + timeLabel + '*' : ''}`, total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : 0;
      msg += `\n\n*${s.name}* sent to ${sent} users on all WATIs.`;
      msg += `\nExpected: ${exp} Difference: ${diff}`;
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
    let msg = '*UPDATE: ✅*', total = 0;
    rows.forEach(s => {
      const sent = parseInt(val(s.sId)) || 0;
      const exp  = parseInt(val(s.eId)) || 0;
      const diff = exp > 0 ? Math.abs(exp - sent) : '';
      msg += `\n\n${batch} BATCH *${s.name}* message sent to ${sent} users on ${wati}.`;
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
    let msg = '*UPDATE: ✅*', total = 0;
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
    let msg = '*UPDATE: ✅*', total = 0;
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
  if (tpl === 'pause')        return 'pause/unpause';
  if (tpl === 'attendance')   return 'attendance';
  if (tpl === 'sunday')       return 'sunday';
  if (tpl === 'reminder')     return 'reminder';
  if (tpl === 'night' || tpl === 'night_hindi') return 'night';
  if (tpl === 'simple')       return 'strong';
  if (tpl === 'extra_session') return 'extra';
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
    // Attendance rows: show all (even 0-count) once CID is set
    // Other types: only rows with CID or sent count
    const filled = freeBroadcasts.filter(fb =>
      fb.type === 'Attendance' ? !!fb.cid : (fb.sent || fb.cid)
    );
    if (!filled.length) { msg = ''; preview.value = msg; return; }

    const rowLines = [];
    let lastNightPresent = null;
    for (const fb of filled) {
      const cid  = fb.cid  || '?';
      const sent = parseInt(fb.sent)     || 0;
      const exp  = parseInt(fb.expected) || 0;
      const diff = Math.abs(exp - sent);
      const wati = fb.wati || getWatiFromCid(fb.cid) || 'all WATIs';
      let line;

      if (fb.type === 'Attendance') {
        if (fb.day === 'normal') {
          const batchStr = (fb.batch || '1st batch').replace(/\b\w/g, c => c.toUpperCase());
          line = `CID ${cid} ${batchStr} Normal Attendance sent to ${sent} users on ${wati}`;
        } else {
          line = `CID ${cid} ${fb.day} Attendance sent to ${sent} users on ${wati}`;
        }
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Bonus') {
        line = `CID ${cid} Bonus live sent to ${sent} users on ${wati}`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Orientation') {
        line = `CID ${cid} Orientation Reminder sent to ${sent} users on ${wati}.`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Payment') {
        line = `CID ${cid} Payment Message sent to ${sent} users on ${wati}.`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Quiz') {
        const tp = lastBcTime ? formatTimePrefix(lastBcTime) + ' ' : '';
        line = `CID ${cid}\n${tp}quiz Message sent to ${sent} users on ${wati}.`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Night Present') {
        lastNightPresent = fb;
        line = `CID ${cid}\nPresent Message sent to ${sent} users on ${wati}`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;

      } else if (fb.type === 'Night Absent') {
        line = `Absent Message sent to ${sent} users on ${wati}`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;
        if (lastNightPresent && lastNightPresent.cid === fb.cid) {
          line += `\n\nTotal count: ${(parseInt(lastNightPresent.sent)||0) + sent}`;
        }
        lastNightPresent = null;

      } else {
        // Morning Message / Evening Message
        line = `CID ${cid} ${fb.type} sent to ${sent} users on ${wati}.`;
        line += `\nExpected count: ${exp}\nDifference:  ${diff}`;
        if (parseInt(fb.yest) > 0) line += `\nYesterday's Count : ${fb.yest}`;
      }

      rowLines.push(line);
    }
    msg = `*UPDATE: ✅*\n\n${rowLines.join('\n\n')}`;
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
    const pad2  = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
    // Use broadcast date from card if it's within last 3 days (not future, not too old)
    const today = (() => {
      if (!lastBcDate) return todayStr;
      const diff = (now - new Date(lastBcDate)) / 86400000;
      return diff >= 0 && diff < 3 ? lastBcDate : todayStr;
    })();
    const time  = lastBcTime || now.toTimeString().slice(0, 5);
    const entries = [];

    if (currentType === 'FREE') {
      const filled = freeBroadcasts.filter(fb => fb.cid || fb.sent);
      if (!filled.length) { showFeedback('CID ya Sent count bharo', 'error'); return; }
      filled.forEach(fb => {
        const sent = parseInt(fb.sent) || 0;
        const exp  = parseInt(fb.expected) || 0;
        const wati = fb.wati || getWatiFromCid(fb.cid);
        let msgname;
        if (fb.type === 'Attendance') {
          msgname = `FREE_CID_${fb.cid}_${fb.batch.replace(/\s+/g,'_')}_${fb.day.replace(/\s+/g,'_')}_Attendance`;
        } else {
          msgname = `FREE_CID_${fb.cid}_${fb.type.replace(/\s+/g,'_')}`;
        }
        entries.push({ msgname, sent, expected: exp, diff: exp - sent,
          _freeType: 'free', _cid: fb.cid, _wati: wati, _msgType: fb.type });
      });
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
      } else if (tpl === 'extra_session') {
        const sub = document.getElementById('extraSubType')?.value || 'water';
        if (sub === 'water') {
          const time = document.getElementById('extraWaterTime')?.value || '11:00 AM';
          const sent = parseInt(document.getElementById('extraWaterSent')?.value) || 0;
          if (!sent) { showFeedback('Sent count bharo', 'error'); return; }
          // noSheet:false → goes to main count sheet (WATER REMINDER rows)
          entries.push({ msgname: 'Water_Reminder_' + time.replace(/[\s:]/g, ''), sent, expected: 0, diff: 0, noSheet: false,
            _bcTime: lastBcTime || null,
            _extraType: 'water', _extraTime: time,
            _extraWati: document.getElementById('extraWaterWati')?.value || '' });
        } else if (sub === 'email') {
          const sent = parseInt(document.getElementById('extraEmailSent')?.value) || 0;
          const exp  = parseInt(document.getElementById('extraEmailExp')?.value) || 0;
          if (!sent) { showFeedback('Sent count bharo', 'error'); return; }
          const emailTime = document.getElementById('extraEmailTime')?.value || lastBcTime || null;
          // noSheet:false → goes to main count sheet (Email - Reminder Message rows)
          entries.push({ msgname: 'Paid_YE_Email_Reminder', sent, expected: exp, diff: exp - sent, noSheet: false,
            _bcTime: emailTime,
            _extraType: 'email',
            _extraBatch: document.getElementById('extraEmailBatch')?.value || '' });
        } else if (sub === 'se') {
          const sent = parseInt(document.getElementById('extraSESent')?.value) || 0;
          if (!sent) { showFeedback('Sent count bharo', 'error'); return; }
          // noSheet:true → Firestore only (independent, no count-sheet row needed)
          entries.push({ msgname: 'Paid_SE_Attendance', sent, expected: 0, diff: 0, noSheet: true,
            _extraType: 'se',
            _extraBatch: document.getElementById('extraSEBatch')?.value || '',
            _extraWati: document.getElementById('extraSEWati')?.value || '' });
        }
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
      } else if (tpl === 'sunday') {
        [
          { name: 'Sunday Attendance tracker',       s: 'sunAttSent',   e: 'sunAttExp'   },
          { name: 'Sunday Milestone tracker',        s: 'sunMilSent',   e: 'sunMilExp'   },
          { name: 'Hindi Sunday Attendance tracker', s: 'sunHindiSent', e: 'sunHindiExp' },
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
    if (!resp.ok) throw new Error('Firestore fetch failed: ' + resp.status);
    const doc  = await resp.json();
    if (!doc.fields || Object.keys(doc.fields).length === 0) throw new Error('Empty Firestore response — aborted to protect data');
    const data = fromFS(doc.fields || {});
    const records = data.records || [];
    // Local backup before every save — recoverable from extension storage
    if (records.length > 0) {
      chrome.storage.local.set({ recordsBackup: { records, savedAt: Date.now() } });
    }

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
      'Sunday Attendance tracker':                        'Paid_Sunday_Attendance_tracker',
      'Sunday Milestone tracker':                         'Paid_Sunday_Milestone_tracker',
      'Hindi Sunday Attendance tracker':                  'Paid_Hindi_Sunday_Attendance_tracker',
    };
    entries.forEach(e => { if (MSG_TO_SCHEDULER[e.msgname]) e.msgname = MSG_TO_SCHEDULER[e.msgname]; });
    // Save sheet-safe msgname before BC matching overwrites it with scheduler name
    // BC name (e.g. "Paid_Hindi_Night_Reminder_Sat") loses absent/present info needed by count-sheet.gs
    entries.forEach(e => { e._sheetMsgname = e.msgname; });

    // Match each entry to a scheduled broadcast so dashboard scheduler auto-marks done
    const broadcasts   = data.broadcasts || [];
    const curMins      = toMins(time);
    const usedBcIds    = new Set();

    entries.forEach(entry => {
      const n = entry.msgname.toLowerCase();
      const isAttendanceEntry = n.includes('attendance') || n.includes('tracker') || n.includes('milestone');

      // Exact name match — first try within ±90 min, then any time (user may save hours later)
      const sortByTimeDist = (a, b_) => {
        const da = a.time ? Math.abs(toMins(a.time) - curMins) : 999;
        const db = b_.time ? Math.abs(toMins(b_.time) - curMins) : 999;
        return da - db;
      };
      const bcNear = broadcasts
        .filter(b =>
          b.category === entry.category &&
          !usedBcIds.has(b.id) &&
          b.msgname.toLowerCase() === entry.msgname.toLowerCase() &&
          (!b.time || Math.abs(toMins(b.time) - curMins) <= 90)
        )
        .sort(sortByTimeDist)[0];
      const bcAny = bcNear || broadcasts
        .filter(b =>
          b.category === entry.category &&
          !usedBcIds.has(b.id) &&
          b.msgname.toLowerCase() === entry.msgname.toLowerCase()
        )
        .sort(sortByTimeDist)[0];
      const bc = bcAny;

      if (bc) {
        usedBcIds.add(bc.id);
        entry.msgname = bc.msgname;
        // Always prefer actual Stats-click time over scheduled BC time
        entry._bcTime = lastBcTime || bc.time;
      } else if (isAttendanceEntry) {
        // Use actual Stats-click time; fall back to BC's scheduled time
        entry._bcTime = lastBcTime || null;
      } else {
        if (lastBcTime && !entry._bcTime) entry._bcTime = lastBcTime;
      }
    });

    // Duplicate check — warn if same msgname+date+time(±30min) already saved with different count
    const dupes = entries.filter(entry => {
      const entryTime = entry._bcTime || time;
      const existing = records.find(r =>
        r.date === today &&
        r.msgname === entry.msgname &&
        Math.abs(toMins(r.time) - toMins(entryTime)) <= 30
      );
      return existing && String(existing.sent) !== String(entry.sent);
    });
    if (dupes.length) {
      const names = dupes.map(d => {
        const entryTime = d._bcTime || time;
        const old = records.find(r =>
          r.date === today &&
          r.msgname === d.msgname &&
          Math.abs(toMins(r.time) - toMins(entryTime)) <= 30
        );
        return `• ${d.msgname}: ${old.sent} → ${d.sent}`;
      }).join('\n');
      const ok = confirm(`⚠️ Already saved today!\n\n${names}\n\nOverwrite karna hai?`);
      if (!ok) { showFeedback('Save cancelled', 'info'); return; }
    }

    entries.forEach(entry => {
      const recordTime = entry._bcTime || time;
      const idx = records.findIndex(r =>
        r.date === today &&
        r.msgname === entry.msgname &&
        (String(r.sent) === String(entry.sent) ||
         Math.abs(toMins(r.time) - toMins(recordTime)) <= 30)
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
        diff:     entry.diff,
        savedBy:  adminName || undefined,
        savedAt:  (() => { const n = new Date(); let h = n.getHours(); const m = String(n.getMinutes()).padStart(2,'0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; })()
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

    showFeedback(`⏳ Firestore saved (${n})! Sheet update ho raha hai...`, 'info');
    // pause/renewal have no count-sheet rows — skip silently so reset still fires
    const tplNow2 = document.getElementById('paidTemplate')?.value || '';
    const skipSheet = ['pause','renewal_minus','renewal_plus'].includes(tplNow2);
    const sheetEntries = entries.filter(e => !e.noSheet);
    const sheetOk = (skipSheet || !sheetEntries.length) ? true : await postToSheet(sheetEntries, today, time);

    if (!sheetOk && tplNow2 !== 'extra_session') return; // sheet failed — show error, don't reset

    // Extra Session (SE) entries are Firestore-only — no separate sheet tab needed

    // Countdown reset only after sheet confirms update
    const rowsLabel = lastSheetRows ? ` → ${lastSheetRows}` : '';
    let secs = 10;
    const tick = () => {
      showFeedback(`✅ Sheet updated${rowsLabel} | Reset in ${secs}s…`, 'success');
      if (secs <= 0) { document.getElementById('reloadBtn').click(); return; }
      secs--;
      setTimeout(tick, 1000);
    };
    tick();
  } catch(e) {
    showFeedback('❌ Save error: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════
// GOOGLE SHEET SYNC (fire-and-forget)
// ══════════════════════════════════════════════
// Returns true if sheet updated ≥1 row (or CORS no-response), false otherwise
async function postToSheet(entries, date, fallbackTime) {
  try {
    const stored = await new Promise(r => chrome.storage.local.get(['sheetScriptUrl'], r));
    const url = (stored.sheetScriptUrl || '').trim();
    if (!url.startsWith('https://script.google.com/')) return false;

    const rawPayload = entries
      .filter(e => (parseInt(e.sent) || 0) > 0)
      .map(e => ({ msgname: e._sheetMsgname || e.msgname, sent: e.sent, _bcTime: e._bcTime || null, date }));

    const sharedTime = rawPayload.find(e => e._bcTime)?._bcTime || fallbackTime || null;
    const payload = rawPayload.map(e => ({ ...e, _bcTime: e._bcTime || sharedTime }));

    if (!payload.length) { showFeedback('⚠️ Sheet: payload empty (sent=0?)', 'error'); return false; }

    console.log('[Sheet] URL:', url);
    console.log('[Sheet] payload:', JSON.stringify(payload));

    try {
      const resp = await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ entries: payload })
      });
      const txt = await resp.text();
      let parsed;
      try { parsed = JSON.parse(txt); } catch(_) { parsed = null; }
      if (parsed && parsed.ok) {
        // If debug is missing/null/non-array/empty with 0 updated = old script or redirect issue.
        // Re-send via no-cors which preserves the body through redirects.
        if (!Array.isArray(parsed.debug) || (parsed.updated === 0 && parsed.debug.length === 0)) {
          await fetch(url, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ entries: payload })
          });
          showFeedback('✅ Sheet sent!', 'success');
          return true;
        }
        const ok  = parsed.debug.filter(d => d.row).map(d => d.rowName).join(', ');
        lastSheetRows = ok;
        const rowsEntry = parsed.debug.find(d => d.sheetRows);
        const rowsHint  = rowsEntry ? ' | sheetRows:[' + rowsEntry.sheetRows.slice(0,8).join('|') + ']' : '';
        const bad = parsed.debug.filter(d => d.skip).map(d => d.skip + ':' + (d.msgname||'') + (d.time12 ? '@' + d.time12 : '') + '[' + (d.cat||'') + ']').join(' | ');
        if (parsed.updated > 0) {
          showFeedback('✅ Sheet: ' + parsed.updated + ' updated → ' + ok, 'success');
          return true;
        } else {
          const dbg = bad || parsed.debug.map(d => JSON.stringify(d)).slice(0,3).join(' | ') || 'empty debug';
          showFeedback('⚠️ Sheet: 0 — ' + dbg + rowsHint, 'error');
          return false;
        }
      } else {
        showFeedback('⚠️ Sheet: ' + (parsed?.error || txt || 'no response'), 'error');
        return false;
      }
    } catch(_) {
      // CORS/redirect fallback — assume success
      await fetch(url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ entries: payload })
      });
      showFeedback('✅ Sheet sent (no response)', 'success');
      return true;
    }
  } catch(_) { return false; }
}

// ══════════════════════════════════════════════
// EXTRA SESSION SHEET SYNC
// ══════════════════════════════════════════════
async function postExtraToSheet(entries, date, fallbackTime) {
  try {
    const stored = await new Promise(r => chrome.storage.local.get(['sheetScriptUrl'], r));
    const url = (stored.sheetScriptUrl || '').trim();
    if (!url.startsWith('https://script.google.com/')) return;

    const payload = entries.map(e => {
      const base = { type: e._extraType, date, savedBy: adminName || '' };
      if (e._extraType === 'water') {
        return { ...base, time: e._extraTime || fallbackTime, sent: e.sent,
          wati: e._extraWati || '', yesterday: e._extraYest || 0 };
      } else if (e._extraType === 'email') {
        return { ...base, time: fallbackTime, batch: e._extraBatch || '',
          sent: e.sent, expected: e.expected, diff: e.diff, yesterday: e._extraYest || 0 };
      } else {
        return { ...base, time: fallbackTime, batch: e._extraBatch || '',
          sent: e.sent, wati: e._extraWati || '' };
      }
    });

    const body = JSON.stringify({ extraEntries: payload });
    console.log('[ExtraSheet] payload:', body);

    try {
      const resp = await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body
      });
      const txt = await resp.text();
      let parsed; try { parsed = JSON.parse(txt); } catch(_) { parsed = null; }

      if (parsed?.ok && parsed?.extra !== undefined) {
        // doPost ran correctly
        showFeedback(`✅ Extra sheet: ${parsed.extra} row added`, 'success');
      } else {
        // redirect hit doGet — send no-cors to actually trigger doPost
        await fetch(url, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' }, body
        });
        showFeedback('✅ Extra sheet sent', 'success');
      }
    } catch(_) {
      await fetch(url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' }, body
      });
      showFeedback('✅ Extra sheet sent', 'success');
    }
  } catch(e) { console.warn('[ExtraSheet] error:', e.message); }
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
  if (data.bcTime) lastBcTime = data.bcTime;
  if (data.bcDate) lastBcDate = data.bcDate;

  // Use broadcast time (bcTime) for yesterday lookup — extraction time (extractedAt) is wrong
  const timeStr = data.bcTime ||
    (data.extractedAt
      ? new Date(data.extractedAt).toTimeString().slice(0, 5)
      : new Date().toTimeString().slice(0, 5));

  if (currentType === 'FREE') {
    const cid  = data.cid || '';
    const wati = data.wati || (cid ? getWatiFromCid(cid) : '');

    // Auto-detect type from templateHint + broadcastType
    const isAtt = data.templateHint === 'attendance';
    let timeType;
    if      (isAtt)                                                 timeType = 'Attendance';
    else if (data.templateHint === 'bonus')                         timeType = 'Bonus';
    else if (data.templateHint === 'orientation')                   timeType = 'Orientation';
    else if (data.templateHint === 'quiz')                          timeType = 'Quiz';
    else if (data.templateHint === 'payment')                       timeType = 'Payment';
    else if (data.templateHint === 'night' || data.templateHint === 'night_hindi')
      timeType = data.broadcastType === 'absent' ? 'Night Absent' : 'Night Present';
    else {
      // Time-based fallback using FREE schedule (Mon-Sat):
      // 07-09 = morning attendance, 14:00 = quiz, 17:30-19 = evening attendance,
      // 20:50 = payment, 21:00 = night
      const byTime = (() => {
        const t = data.bcTime; if (!t) return null;
        const [hh, mm] = t.split(':').map(Number);
        if (hh === 21 && mm === 0)  return data.broadcastType === 'absent' ? 'Night Absent' : 'Night Present';
        if (hh === 20 && mm === 50) return 'Payment';
        if (hh === 14 && mm === 0)  return 'Quiz';
        if ((hh >= 7 && hh <= 9) || (hh === 17 && mm >= 30) || hh === 18 || hh === 19) return 'Attendance';
        return null;
      })();
      timeType = byTime || (data.bcTime
        ? (parseInt(data.bcTime.split(':')[0]) < 14 ? 'Morning Message' : 'Evening Message')
        : getMsgTimeType());
    }

    // Auto-detect day from attDayHint (card text), fallback to campaign name
    let autoDay = 'normal';
    if (isAtt) {
      const dayStr = data.attDayHint || data.campaignName || '';
      const dm = dayStr.match(/day\s*(\d+)/i);
      if (dm) {
        const n = parseInt(dm[1]);
        autoDay = [1,3,7,14].includes(n) ? `Day ${n}` : 'normal';
      }
    }

    // Auto-detect batch from attBatchHint (card text)
    const autoBatch = (isAtt && data.attBatchHint) ? data.attBatchHint : '1st batch';

    const isNight = timeType === 'Night Present' || timeType === 'Night Absent';
    const watiVal = wati || getWatiFromCid(cid);

    // ── RESET / SETUP ────────────────────────────────────────────────────────
    if (isNight && cid) {
      // Night always auto-creates Present+Absent pair (like PAID nightWrap).
      // Remove non-Night rows and rows for a different CID.
      freeBroadcasts = freeBroadcasts.filter(fb =>
        (fb.type === 'Night Present' || fb.type === 'Night Absent') && fb.cid === cid
      );
      if (!freeBroadcasts.some(fb => fb.type === 'Night Present'))
        freeBroadcasts.push({ cid, type:'Night Present', batch:'1st batch', day:'normal', wati:watiVal, sent:'', expected:'', yest:'' });
      if (!freeBroadcasts.some(fb => fb.type === 'Night Absent'))
        freeBroadcasts.push({ cid, type:'Night Absent', batch:'1st batch', day:'normal', wati:watiVal, sent:'', expected:'', yest:'' });
      // Present always before Absent
      freeBroadcasts.sort((a, b) => (a.type === 'Night Present' ? -1 : b.type === 'Night Present' ? 1 : 0));
    } else if (isAtt && cid && freeBroadcasts.some(fb => fb.type === 'Attendance' && fb.cid === cid)) {
      freeBroadcasts = freeBroadcasts.filter(fb => fb.type === 'Attendance' && fb.cid === cid);
    } else {
      freeBroadcasts = [];
    }

    // Attendance: first click for a CID auto-creates all 4 day slots (Normal, Day 1, Day 3, Day 7)
    if (isAtt && cid && !freeBroadcasts.some(fb => fb.type === 'Attendance' && fb.cid === cid)) {
      const watiVal = wati || getWatiFromCid(cid);
      ['normal', 'Day 1', 'Day 3', 'Day 7'].forEach(d =>
        freeBroadcasts.push({ cid, type:'Attendance', batch:'1st batch', day:d, wati:watiVal, sent:'', expected:'', yest:'' })
      );
    }

    // Find the specific row to fill
    let rowIdx;
    if (isAtt && cid) {
      rowIdx = freeBroadcasts.findIndex(fb => fb.type === 'Attendance' && fb.cid === cid && fb.day === autoDay);
      if (rowIdx < 0) rowIdx = freeBroadcasts.findIndex(fb => fb.type === 'Attendance' && fb.cid === cid && !fb.sent);
    } else {
      // Match by CID + type — Night Present and Night Absent share same CID, must not cross-fill
      rowIdx = cid ? freeBroadcasts.findIndex(fb => fb.cid === cid && fb.type === timeType) : -1;
      if (rowIdx < 0) rowIdx = freeBroadcasts.findIndex(fb => fb.type === timeType && !fb.cid && !fb.sent);
      if (rowIdx < 0) rowIdx = freeBroadcasts.findIndex(fb => !fb.cid && !fb.sent);
    }
    if (rowIdx < 0) { freeBroadcasts.push({ cid:'', type:timeType, batch:autoBatch, day:autoDay, wati:'', sent:'', expected:'', yest:'' }); rowIdx = freeBroadcasts.length - 1; }

    const fb = freeBroadcasts[rowIdx];
    if (cid) fb.cid = cid;
    fb.wati = wati || fb.wati || getWatiFromCid(cid);
    fb.type = timeType;
    if (isAtt) {
      fb.day = autoDay;
      if (autoBatch) fb.batch = autoBatch;
    }
    if (data.sentCount)     fb.sent     = data.sentCount;
    if (data.expectedCount) fb.expected = data.expectedCount;
    renderFreeRows(); updatePreview(); saveData();
    if (data.sentCount) showFeedback('✅ Free broadcast fill hua!', 'success');
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
      saveData();
      if (data.yesterdayCount) {
        setVal('paidYestCount', data.yesterdayCount);
      } else if (data.campaignName) {
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yest = await fetchYesterdayCount(data.campaignName, timeStr);
        if (yest !== null) { setVal('paidYestCount', String(yest)); showFeedback('✅ Yesterday count aaya!', 'success'); }
        else showFeedback('ℹ️ Yesterday nahi mila — manually dalo', 'info');
      }
    } else if (tpl === 'pause') {
      const pauseFilled = id => filledSlots.has(id);
      if (!pauseFilled('pauseSent') || !pauseFilled('unpauseSent')) {
        if (!pauseFilled('pauseSent')) {
          if (data.sentCount)     { setVal('pauseSent', data.sentCount); filledSlots.add('pauseSent'); }
          if (data.expectedCount) setVal('pauseExpected', data.expectedCount);
          showFeedback('✅ Pause slot fill hua!', 'success');
        } else {
          if (data.sentCount)     { setVal('unpauseSent', data.sentCount); filledSlots.add('unpauseSent'); }
          if (data.expectedCount) setVal('unpauseExpected', data.expectedCount);
          showFeedback('✅ Unpause slot fill hua!', 'success');
        }
      } else {
        // Both filled — user explicitly re-extracts, start fresh
        filledSlots.delete('pauseSent'); filledSlots.delete('unpauseSent');
        if (data.sentCount)     { setVal('pauseSent', data.sentCount); filledSlots.add('pauseSent'); }
        if (data.expectedCount) setVal('pauseExpected', data.expectedCount);
        setVal('unpauseSent',     '');
        setVal('unpauseExpected', '');
        showFeedback('✅ Pause slot fill hua (reset)!', 'success');
      }
      saveData();
    } else if (tpl === 'renewal_minus') {
      const slots  = ['renewX1','renewX2','renewX3'];
      const labels = ['X-1','X-2','X-3'];
      let idx = slots.findIndex(s => !filledSlots.has(s) && !val(s));
      if (idx < 0) { slots.forEach(s => { setVal(s, ''); filledSlots.delete(s); }); idx = 0; }
      if (data.sentCount) {
        setVal(slots[idx], data.sentCount);
        filledSlots.add(slots[idx]);
        saveData();
        showFeedback(`✅ ${labels[idx]} fill hua!`, 'success');
      }
    } else if (tpl === 'renewal_plus') {
      const slots  = ['renewX','renewXp1','renewXp2','renewXp3'];
      const labels = ['X','X+1','X+2','X+3'];
      let idx = slots.findIndex(s => !filledSlots.has(s) && !val(s));
      if (idx < 0) { slots.forEach(s => { setVal(s, ''); filledSlots.delete(s); }); idx = 0; }
      if (data.sentCount) {
        setVal(slots[idx], data.sentCount);
        filledSlots.add(slots[idx]);
        saveData();
        showFeedback(`✅ ${labels[idx]} fill hua!`, 'success');
      }
    } else if (tpl === 'attendance') {
      const n = (data.campaignName || '').toLowerCase();
      const attSlots = [
        { sId:'att1Sent', eId:'att1Exp', label:'Attendance' },
        { sId:'att2Sent', eId:'att2Exp', label:'Milestone'  },
        { sId:'att3Sent', eId:'att3Exp', label:'Hindi Att'  },
      ];
      const preferred = n.includes('milestone') ? attSlots[1]
                      : n.includes('hindi')      ? attSlots[2]
                      : attSlots[0];
      const attFilled = s => filledSlots.has(s.sId);
      const attSlot = (!attFilled(preferred)) ? preferred
                    : (attSlots.find(s => !attFilled(s)) || preferred);
      const { sId, eId, label } = attSlot;
      if (data.sentCount)     { setVal(sId, data.sentCount); filledSlots.add(sId); }
      if (data.expectedCount) setVal(eId, data.expectedCount);
      saveData(); // save slot immediately — popup may close during the await below
      showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
      const yestAtt = await fetchYesterdayTotal('attendance', timeStr);
      if (yestAtt !== null) { setVal('paidYestCount', String(yestAtt)); showFeedback(`✅ ${label} slot fill hua!`, 'success'); }
      else showFeedback(`✅ ${label} slot fill hua! (Yesterday manually dalo)`, 'info');
    } else if (tpl === 'reminder') {
      const n = (data.campaignName || '').toLowerCase();
      const remSlots = [
        { sId:'remYESent',    eId:'remYEExp',    label:'YE Reminder'    },
        { sId:'remHindiSent', eId:'remHindiExp', label:'Hindi Reminder' },
      ];
      const preferred = n.includes('hindi') ? remSlots[1] : remSlots[0];
      const remFilled = s => filledSlots.has(s.sId);
      const remSlot = (!remFilled(preferred)) ? preferred
                    : (remSlots.find(s => !remFilled(s)) || preferred);
      const { sId, eId, label } = remSlot;
      if (data.sentCount)     { setVal(sId, data.sentCount); filledSlots.add(sId); }
      if (data.expectedCount) setVal(eId, data.expectedCount);
      saveData(); // save slot immediately — popup may close during the await below
      showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
      const yestRem = await fetchYesterdayTotal('reminder', timeStr);
      if (yestRem !== null) { setVal('paidYestCount', String(yestRem)); showFeedback(`✅ ${label} slot fill hua!`, 'success'); }
      else showFeedback(`✅ ${label} slot fill hua! (Yesterday manually dalo)`, 'info');
    } else if (tpl === 'night') {
      const typeStr = (data.broadcastType || data.campaignName || '').toLowerCase();
      const slots = [
        { sId:'nightAbsentSent',  eId:'nightAbsentExp',  label:'Absent'  },
        { sId:'nightPresentSent', eId:'nightPresentExp', label:'Present' },
        { sId:'nightSundaySent',  eId:'nightSundayExp',  label:'Sunday'  },
      ];
      // absent-before-present fallback when card text spans both cards
      const preferred = typeStr.includes('sunday') ? slots[2]
                      : typeStr.includes('absent')  ? slots[0]
                      : typeStr.includes('present') ? slots[1]
                      : null;
      // filledSlots is the authoritative guard — cleared only by Reload or Copy&Save
      const isFilled = s => filledSlots.has(s.sId);
      const slot = (preferred && !isFilled(preferred))
                 ? preferred
                 : (slots.find(s => !isFilled(s)) || preferred || slots[0]);
      if (data.sentCount)     { setVal(slot.sId, data.sentCount); filledSlots.add(slot.sId); }
      if (data.expectedCount) setVal(slot.eId, data.expectedCount);
      saveData(); // save slot immediately — popup may close during the await below
      showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
      const yestNight = await fetchYesterdayTotal('night', timeStr, false);
      if (yestNight !== null) { setVal('paidYestCount', String(yestNight)); showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success'); }
      else showFeedback(`✅ Night ${slot.label} slot fill hua! (Yesterday manually dalo)`, 'info');
    } else if (tpl === 'night_hindi') {
      const typeStr = (data.broadcastType || data.campaignName || '').toLowerCase();
      const slots = [
        { sId:'nightHindiAbsentSent',  eId:'nightHindiAbsentExp',  label:'Hindi Absent'  },
        { sId:'nightHindiPresentSent', eId:'nightHindiPresentExp', label:'Hindi Present' },
        { sId:'nightHindiSundaySent',  eId:'nightHindiSundayExp',  label:'Hindi Sunday'  },
      ];
      const preferred = typeStr.includes('sunday') ? slots[2]
                      : typeStr.includes('absent')  ? slots[0]
                      : typeStr.includes('present') ? slots[1]
                      : null;
      const isFilled = s => filledSlots.has(s.sId);
      const slot = (preferred && !isFilled(preferred))
                 ? preferred
                 : (slots.find(s => !isFilled(s)) || preferred || slots[0]);
      if (data.sentCount)     { setVal(slot.sId, data.sentCount); filledSlots.add(slot.sId); }
      if (data.expectedCount) setVal(slot.eId, data.expectedCount);
      saveData(); // save slot immediately — popup may close during the await below
      showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
      const yestNightH = await fetchYesterdayTotal('night', timeStr, true);
      if (yestNightH !== null) { setVal('paidYestCount', String(yestNightH)); showFeedback(`✅ Night ${slot.label} slot fill hua!`, 'success'); }
      else showFeedback(`✅ Night ${slot.label} slot fill hua! (Yesterday manually dalo)`, 'info');
    } else if (tpl === 'sunday') {
      const n = (data.campaignName || '').toLowerCase();
      const sunSlots = [
        { sId:'sunAttSent',   eId:'sunAttExp',   label:'Sunday Att'        },
        { sId:'sunMilSent',   eId:'sunMilExp',   label:'Sunday Milestone'  },
        { sId:'sunHindiSent', eId:'sunHindiExp', label:'Hindi Sunday Att'  },
      ];
      const preferred = n.includes('milestone') ? sunSlots[1]
                      : n.includes('hindi')      ? sunSlots[2]
                      : sunSlots[0];
      const isFilled = s => filledSlots.has(s.sId);
      const sunSlot = (!isFilled(preferred)) ? preferred
                    : (sunSlots.find(s => !isFilled(s)) || preferred);
      if (data.sentCount)     { setVal(sunSlot.sId, data.sentCount); filledSlots.add(sunSlot.sId); }
      if (data.expectedCount) setVal(sunSlot.eId, data.expectedCount);
      // Update time display
      if (lastBcTime) {
        const el = document.getElementById('sundayTimeDisplay');
        if (el) {
          const [hh, mm] = lastBcTime.split(':');
          let h = parseInt(hh);
          const ampm = h >= 12 ? 'PM' : 'AM';
          if (h > 12) h -= 12; else if (h === 0) h = 12;
          el.textContent = `📅 Broadcast time: ${h}:${mm} ${ampm}`;
        }
      }
      saveData();
      showFeedback(`✅ ${sunSlot.label} slot fill hua!`, 'success');
    } else if (tpl === 'extra_session') {
      const n = (data.campaignName || '').toLowerCase();
      const sub = n.includes('water') ? 'water'
                : (n.includes('email') || n.includes('mail')) ? 'email'
                : 'se';
      setVal('extraSubType', sub);
      onExtraTypeChange();

      if (sub === 'water') {
        // Auto-select closest time slot from broadcast time
        const waterSlots = [
          { val: '11:00 AM', mins: 660  },
          { val: '02:00 PM', mins: 840  },
          { val: '05:00 PM', mins: 1020 },
          { val: '08:15 PM', mins: 1215 },
        ];
        const bcTime = data.bcTime || lastBcTime;
        let closest = null;
        if (bcTime) {
          const [hh, mm] = bcTime.split(':').map(Number);
          const bcMins = hh * 60 + mm;
          closest = waterSlots.reduce((a, b) =>
            Math.abs(a.mins - bcMins) < Math.abs(b.mins - bcMins) ? a : b
          );
          setVal('extraWaterTime', closest.val);
          setVal('extraWaterWati', closest.val === '08:15 PM' ? 'only WATI 28' : 'all paid WATIs except 28');
        }
        if (data.sentCount) { setVal('extraWaterSent', data.sentCount); filledSlots.add('extraWaterSent'); }
        saveData();
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const waterMsgname = 'Water_Reminder_' + (closest ? closest.val : document.getElementById('extraWaterTime')?.value || '11:00 AM').replace(/[\s:]/g, '');
        const yestW = await fetchYesterdayCount(waterMsgname, timeStr);
        if (yestW !== null) { setVal('extraWaterYest', String(yestW)); showFeedback('✅ Water Reminder slot fill hua!', 'success'); }
        else showFeedback('✅ Water Reminder fill hua! (Yesterday manually dalo)', 'info');
      } else if (sub === 'email') {
        // Auto-select closest email time slot
        const emailSlots = [
          { val: '05:20', mins: 320 }, { val: '06:45', mins: 405 },
          { val: '07:45', mins: 465 }, { val: '16:20', mins: 980 },
          { val: '17:20', mins: 1040 }, { val: '18:20', mins: 1100 }
        ];
        const bcTime = data.bcTime || lastBcTime;
        if (bcTime) {
          const [hh, mm] = bcTime.split(':').map(Number);
          const bcMins = hh * 60 + mm;
          const closest = emailSlots.reduce((a, b) =>
            Math.abs(a.mins - bcMins) < Math.abs(b.mins - bcMins) ? a : b
          );
          setVal('extraEmailTime', closest.val);
        }
        const emailSent = data.triggeredCount || data.sentCount;
        if (emailSent)          { setVal('extraEmailSent', emailSent); filledSlots.add('extraEmailSent'); }
        if (data.expectedCount) setVal('extraEmailExp', data.expectedCount);
        saveData();
        showFeedback('⏳ Yesterday count fetch ho raha hai...', 'info');
        const yestE = await fetchYesterdayCount('Paid_YE_Email_Reminder', timeStr);
        if (yestE !== null) { setVal('extraEmailYest', String(yestE)); showFeedback('✅ Email Reminder slot fill hua!', 'success'); }
        else showFeedback('✅ Email Reminder fill hua! (Yesterday manually dalo)', 'info');
      } else {
        if (data.sentCount) { setVal('extraSESent', data.sentCount); filledSlots.add('extraSESent'); }
        saveData();
        showFeedback('✅ SE Attendance slot fill hua!', 'success');
      }
      updatePreview();
    }
  }

  saveData(); // persist slot values so redirect works if popup is reopened before next slot click
  document.getElementById('preview').dataset.userEdited = 'false';
  updatePreview();
}

// ── MONDAY → SATURDAY, else YESTERDAY ────────
// Uses lastBcDate as base when set — prevents fetching same-day records when
// broadcast date equals today-1 (e.g. processing May 2 broadcast on May 3)
function getPrevDate() {
  const base = lastBcDate ? new Date(lastBcDate + 'T12:00:00') : new Date();
  base.setDate(base.getDate() - (base.getDay() === 1 ? 2 : 1));
  return base.toISOString().slice(0, 10);
}
function getPrevLabel() {
  const base = lastBcDate ? new Date(lastBcDate + 'T12:00:00') : new Date();
  return base.getDay() === 1 ? "Saturday's Count" : "Yesterday's Count";
}

// ── COUNT SHEET CSV FALLBACK ──────────────────────────────────────────────
const CS_CSV_URL = 'https://docs.google.com/spreadsheets/d/17KV51RAjGrrCftIfei9obV-QXl1aC7AF6XAF0lUQsIU/export?format=csv&gid=617135708';

function _parseCSVLine(line) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields;
}
function _parseDateHdr(raw) {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3]);
  if (a > 12) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (b > 12) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if (y >= 2026) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function _csSheetTimeMins(t) {
  if (!t) return -1;
  const s = t.trim().toLowerCase();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1]); const min = parseInt(m12[2]);
    if (m12[3] === 'pm' && h !== 12) h += 12;
    if (m12[3] === 'am' && h === 12) h = 0;
    return h * 60 + min;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  return -1;
}
// ── MISMATCH DIALOG ─────────────────────────────────────────────────────
// Returns a Promise that resolves with the user's chosen value (or null if cancelled)
function showMismatchPopup(fsVal, csVal) {
  return new Promise(resolve => {
    document.getElementById('mm-fs-val').textContent = Number(fsVal).toLocaleString('en-IN');
    document.getElementById('mm-cs-val').textContent = Number(csVal).toLocaleString('en-IN');
    const overlay = document.getElementById('mismatch-overlay');
    overlay.classList.add('show');
    const cleanup = (val) => { overlay.classList.remove('show'); resolve(val); };
    document.getElementById('mm-btn-fs').onclick  = () => cleanup(fsVal);
    document.getElementById('mm-btn-cs').onclick  = () => cleanup(csVal);
    document.getElementById('mm-cancel').onclick  = () => cleanup(null);
  });
}

// Fetch yesterday count from count sheet by time match
// sumAll=true: sum ALL rows within ±30 min (use for night = present+absent)
// sumAll=false: return single closest row within ±10 min (default)
async function fetchCountSheetYesterday(currentTimeStr, sumAll = false) {
  try {
    const yDate = getPrevDate();
    const toMins = t => { if (!t) return -1; const [h,m] = t.split(':').map(Number); return h*60+(m||0); };
    const curMins = toMins(currentTimeStr);
    if (curMins < 0) return null;

    const resp = await fetch(CS_CSV_URL + '&_=' + Date.now());
    if (!resp.ok) return null;
    const text = await resp.text();
    const lines = text.split('\n');
    const hdr = _parseCSVLine(lines[1] || '');

    let yCol = -1;
    for (let c = 5; c < hdr.length; c++) {
      if (_parseDateHdr(hdr[c].trim().replace(/"/g,'')) === yDate) { yCol = c; break; }
    }
    if (yCol < 0) return null;

    if (sumAll) {
      // Sum all rows within ±30 min (night present + absent)
      let total = 0;
      for (let i = 2; i < lines.length; i++) {
        const f = _parseCSVLine(lines[i]);
        if (!f[0] || !f[0].trim()) continue;
        const rowMins = _csSheetTimeMins((f[1]||'').trim());
        if (rowMins < 0 || Math.abs(rowMins - curMins) > 30) continue;
        const v = parseInt((f[yCol]||'').replace(/[^0-9]/g,''));
        if (v > 0) total += v;
      }
      return total > 0 ? total : null;
    }

    // Single best match within ±10 min
    let best = null, bestDiff = 11;
    for (let i = 2; i < lines.length; i++) {
      const f = _parseCSVLine(lines[i]);
      if (!f[0] || !f[0].trim()) continue;
      const rowMins = _csSheetTimeMins((f[1]||'').trim());
      if (rowMins < 0) continue;
      const diff = Math.abs(rowMins - curMins);
      if (diff < bestDiff) {
        const v = parseInt((f[yCol]||'').replace(/[^0-9]/g,''));
        if (v > 0) { bestDiff = diff; best = v; }
      }
    }
    return best;
  } catch(e) { return null; }
}

// ── FETCH YESTERDAY TOTAL (sum records by subtype ±30 min) ───────────────
// hindiOnly: true = only Hindi records, false = only non-Hindi, null = all
async function fetchYesterdayTotal(subtype, currentTimeStr, hindiOnly = null) {
  let fsVal = null;
  try {
    const yDate = getPrevDate();
    const resp  = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
    if (resp.ok) {
      const doc  = await resp.json();
      const data = fromFS(doc.fields || {});
      const toMins = t => { if (!t) return -1; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
      const curMins    = toMins(currentTimeStr);
      const matchHindi = r => (r.msgname || '').toLowerCase().includes('hindi');
      const records = (data.records || []).filter(r => {
        if (r.date !== yDate || !r.time) return false;
        const diff = Math.abs(toMins(r.time) - curMins);
        if (r.subtype === subtype && diff <= 30) {
          if (hindiOnly !== null && matchHindi(r) !== hindiOnly) return false;
          return true;
        }
        if (subtype === 'reminder' &&
            (r.msgname || '').toLowerCase().includes('reminder') &&
            !(r.msgname || '').toLowerCase().includes('night') &&
            diff <= 20) return true;
        return false;
      });
      if (records.length) fsVal = records.reduce((sum, r) => sum + (parseInt(r.sent) || 0), 0);
    }
  } catch(e) {}

  // CS fallback: Hindi night has no sheet rows → skip; non-Hindi night → sum present+absent
  let csVal = null;
  if (subtype === 'night' && hindiOnly === true) {
    csVal = null; // no Hindi night rows in count sheet
  } else if (subtype === 'night') {
    csVal = await fetchCountSheetYesterday(currentTimeStr, true); // sum all ±30 min rows
  } else {
    csVal = await fetchCountSheetYesterday(currentTimeStr);
  }

  if (fsVal !== null && csVal !== null && fsVal !== csVal) return await showMismatchPopup(fsVal, csVal);
  return fsVal ?? csVal;
}

// ── FETCH YESTERDAY COUNT (closest time match) ─
async function fetchYesterdayCount(msgname, currentTimeStr) {
  let fsVal = null;
  try {
    const yDate = getPrevDate();
    const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
    if (resp.ok) {
      const doc  = await resp.json();
      const data = fromFS(doc.fields || {});
      const toMins = t => { if (!t) return -1; const [h,m] = t.split(':').map(Number); return h*60+(m||0); };
      const norm = s => (s||'').toLowerCase().trim();
      const matches = (data.records || []).filter(r => r.date === yDate && norm(r.msgname) === norm(msgname));
      if (matches.length) {
        if (matches.length === 1 || !currentTimeStr) fsVal = parseInt(matches[0].sent) || 0;
        else {
          const cur = toMins(currentTimeStr);
          fsVal = parseInt(matches.reduce((a, b) =>
            Math.abs(toMins(a.time) - cur) <= Math.abs(toMins(b.time) - cur) ? a : b
          ).sent) || 0;
        }
      } else if (currentTimeStr) {
        const cur = toMins(currentTimeStr);
        const timeMatches = (data.records || []).filter(r =>
          r.date === yDate && r.time && Math.abs(toMins(r.time) - cur) <= 30
        );
        if (timeMatches.length === 1) fsVal = parseInt(timeMatches[0].sent) || 0;
      }
    }
  } catch(e) {}

  const csVal = await fetchCountSheetYesterday(currentTimeStr);

  if (fsVal !== null && csVal !== null && fsVal !== csVal) return await showMismatchPopup(fsVal, csVal);
  return fsVal ?? csVal;
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
  data.freeBroadcasts = freeBroadcasts;
  if (lastBcDate) data.lastBcDate = lastBcDate;
  if (lastBcTime) data.lastBcTime = lastBcTime;
  data.savedDate    = new Date().toISOString().slice(0, 10);
  data.filledSlotsArr = [...filledSlots]; // exact session fills — used on reload to avoid stale slot confusion
  chrome.storage.local.set({ formData: data });
}

function loadSavedData() {
  chrome.storage.local.get(['formData', 'darkMode', 'autoExtracted', 'sheetScriptUrl', 'adminName'], r => {
    if (r.sheetScriptUrl) setVal('sheetScriptUrl', r.sheetScriptUrl);
    if (r.adminName) { adminName = r.adminName; setVal('adminNameInput', r.adminName); }
    if (r.darkMode) {
      document.body.classList.add('dark');
      document.getElementById('darkBtn').textContent = '☀️';
    }

    const freshExtract = r.autoExtracted && (Date.now() - r.autoExtracted.extractedAt < 120000);

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
      if (d.freeBroadcasts && d.freeBroadcasts.length) freeBroadcasts = d.freeBroadcasts;
      renderFreeRows();
      if (d.lastBcDate) lastBcDate = d.lastBcDate;
      if (d.lastBcTime) lastBcTime = d.lastBcTime;

      const todayStr = new Date().toISOString().slice(0, 10);
      if (!d.savedDate || d.savedDate !== todayStr) {
        // New day — wipe secondary stale slots; keep att1 + lastBcDate/lastBcTime for deferred Copy&Save
        ['att2Sent','att2Exp','att3Sent','att3Exp',
         'remYESent','remYEExp','remHindiSent','remHindiExp',
         'nightAbsentSent','nightAbsentExp','nightPresentSent','nightPresentExp',
         'nightSundaySent','nightSundayExp',
         'nightHindiAbsentSent','nightHindiAbsentExp',
         'nightHindiPresentSent','nightHindiPresentExp',
         'nightHindiSundaySent','nightHindiSundayExp',
         'pauseSent','pauseExpected','unpauseSent','unpauseExpected',
         'renewX1','renewX2','renewX3','renewX','renewXp1','renewXp2','renewXp3',
         'paidYestCount',
        ].forEach(id => setVal(id, ''));
        // lastBcDate/lastBcTime kept so deferred Copy&Save still hits the right sheet column
        // filledSlots stays empty — stale data must not lock new slots
      } else {
        // Same day — restore exact session fills from saved array
        if (d.filledSlotsArr) {
          d.filledSlotsArr.forEach(id => filledSlots.add(id));
        } else {
          // Migration (no filledSlotsArr yet): rebuild all except att2/att3 which are stale-prone
          ['nightAbsentSent','nightPresentSent','nightSundaySent',
           'nightHindiAbsentSent','nightHindiPresentSent','nightHindiSundaySent',
           'remYESent','remHindiSent',
           'pauseSent','unpauseSent',
           'renewX1','renewX2','renewX3','renewX','renewXp1','renewXp2','renewXp3',
          ].forEach(id => { if (d[id]) filledSlots.add(id); });
          if (d['att1Sent']) filledSlots.add('att1Sent'); // att1 ok — primary slot filled today
          // att2Sent and att3Sent intentionally NOT rebuilt — these carry stale cross-day values
        }
        // Clear attendance slots not in filledSlots — wipes stale storage values
        ['att1Sent','att1Exp','att2Sent','att2Exp','att3Sent','att3Exp'].forEach(id => {
          const sentId = id.endsWith('Exp') ? id.slice(0,-3)+'Sent' : id;
          if (!filledSlots.has(sentId)) setVal(id, '');
        });
      }
    }
    // Render everything correctly
    onTemplateChange();

    // Wipe stale autoExtracted (>10 min) so it can't pollute future extracts
    if (r.autoExtracted && !freshExtract && Date.now() - r.autoExtracted.extractedAt > 600000) {
      chrome.storage.local.remove(['autoExtracted']);
    }
    if (freshExtract) {
      fillFields(r.autoExtracted);
      chrome.storage.local.remove(['autoExtracted']); // data now in formData — don't re-fill on next open
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
  if (msg) setTimeout(() => { el.textContent = ''; el.className = 'feedback'; }, 10000);
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

  // Admin lock/unlock for sheet URL
  let _adminUnlocked = false;
  const _urlInput  = document.getElementById('sheetScriptUrl');
  const _lockBtn   = document.getElementById('adminLockBtn');
  const _pinRow    = document.getElementById('adminPinRow');
  const _pinInput  = document.getElementById('adminPinInput');
  const _urlNote   = document.getElementById('sheetUrlNote');

  function _lockSheetUrl() {
    _adminUnlocked = false;
    _urlInput.readOnly = true;
    _urlInput.style.background = 'var(--light)';
    _urlInput.style.color = 'var(--muted)';
    _lockBtn.textContent = '🔒 Admin';
    _pinRow.style.display = 'none';
    _urlNote.textContent = '🔒 Admin se PIN lo URL change karne ke liye';
  }
  function _unlockSheetUrl() {
    _adminUnlocked = true;
    _urlInput.readOnly = false;
    _urlInput.style.background = '';
    _urlInput.style.color = '';
    _lockBtn.textContent = '🔓 Lock';
    _pinRow.style.display = 'none';
    _urlNote.textContent = '✅ Unlocked — URL edit kar sakte ho';
  }

  _lockBtn.addEventListener('click', () => {
    if (_adminUnlocked) { _lockSheetUrl(); return; }
    _pinRow.style.display = _pinRow.style.display === 'flex' ? 'none' : 'flex';
    if (_pinRow.style.display === 'flex') _pinInput.focus();
  });

  async function _checkPin() {
    const entered = _pinInput.value;
    if (!entered) return;
    const stored = await new Promise(r => chrome.storage.local.get(['adminPin'], r));
    if (!stored.adminPin) {
      // First time — set the PIN
      chrome.storage.local.set({ adminPin: entered });
      _unlockSheetUrl();
      _pinInput.value = '';
    } else if (entered === stored.adminPin) {
      _unlockSheetUrl();
      _pinInput.value = '';
    } else {
      _pinInput.style.borderColor = '#ef4444';
      setTimeout(() => { _pinInput.style.borderColor = ''; }, 1000);
      _pinInput.value = '';
      _pinInput.focus();
    }
  }
  document.getElementById('adminPinConfirmBtn').addEventListener('click', _checkPin);
  _pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') _checkPin(); });

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const name = (document.getElementById('adminNameInput')?.value || '').trim();
    adminName = name;
    const saveObj = { adminName: name };
    if (_adminUnlocked) saveObj.sheetScriptUrl = _urlInput.value.trim();
    chrome.storage.local.set(saveObj, () => {
      const fb = document.getElementById('settingsFeedback');
      fb.textContent = '✅ Saved!'; fb.className = 'feedback success';
      setTimeout(() => { fb.textContent = ''; fb.className = 'feedback'; }, 2000);
    });
  });

  document.getElementById('cleanDupsBtn')?.addEventListener('click', async () => {
    const fb = document.getElementById('settingsFeedback');
    fb.textContent = '⏳ Cleaning...'; fb.className = 'feedback info';
    try {
      const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
      const doc  = await resp.json();
      const data = fromFS(doc.fields || {});
      const records = data.records || [];
      const seen = {};
      const cleaned = records.filter(r => {
        const key = `${r.date}_${r.msgname}_${r.sent}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      const removed = records.length - cleaned.length;
      if (removed === 0) { fb.textContent = '✅ No duplicates found'; fb.className = 'feedback success'; return; }
      await fetch(`${FS_URL}/appData/main?key=${API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ ...data, records: cleaned }).mapValue.fields })
      });
      fb.textContent = `✅ ${removed} duplicates removed`; fb.className = 'feedback success';
    } catch(e) {
      fb.textContent = '❌ ' + e.message; fb.className = 'feedback error';
    }
    setTimeout(() => { fb.textContent = ''; fb.className = 'feedback'; }, 4000);
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

  // Backup buttons
  document.getElementById('checkBackupBtn').addEventListener('click', () => {
    const fb = document.getElementById('settingsFeedback');
    chrome.storage.local.get(['recordsBackup'], r => {
      if (!r.recordsBackup) { fb.textContent = '❌ Koi backup nahi mila'; fb.className = 'feedback error'; return; }
      const d = new Date(r.recordsBackup.savedAt);
      fb.textContent = `✅ Backup: ${r.recordsBackup.records.length} records — ${d.toLocaleString()}`;
      fb.className = 'feedback success';
    });
  });

  document.getElementById('restoreBackupBtn').addEventListener('click', async () => {
    const fb = document.getElementById('settingsFeedback');
    chrome.storage.local.get(['recordsBackup'], async r => {
      if (!r.recordsBackup || !r.recordsBackup.records.length) {
        fb.textContent = '❌ Koi backup nahi mila'; fb.className = 'feedback error'; return;
      }
      try {
        fb.textContent = '⏳ Restoring...'; fb.className = 'feedback info';
        const resp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`);
        if (!resp.ok) throw new Error('Fetch failed');
        const doc  = await resp.json();
        const data = fromFS(doc.fields || {});
        const merged = [...r.recordsBackup.records];
        // Merge: add any current records not already in backup (by id)
        const backupIds = new Set(merged.map(x => x.id));
        (data.records || []).forEach(x => { if (!backupIds.has(x.id)) merged.push(x); });
        const saveResp = await fetch(`${FS_URL}/appData/main?key=${API_KEY}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFS({ ...data, records: merged }).mapValue.fields })
        });
        if (!saveResp.ok) throw new Error('Save failed');
        fb.textContent = `✅ Restored! ${merged.length} records wapas aaye`; fb.className = 'feedback success';
      } catch(e) { fb.textContent = '❌ ' + e.message; fb.className = 'feedback error'; }
    });
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
  document.getElementById('reloadBtn').addEventListener('click', async () => {
    // Reset all template fields for every template type
    ['pause','renewal_minus','renewal_plus','attendance','reminder','night','night_hindi','extra_session'].forEach(t => clearTemplateFields(t));
    paidCamps = [{ name: '', sent: '', expected: '', wati: 'all WATIs' }];
    freeBroadcasts = [{ cid:'', type: getMsgTimeType(), batch:'1st batch', day:'normal', wati:'', sent:'', expected:'', yest:'' }];
    renderFreeRows();
    // Reset dropdowns to defaults
    const tplEl   = document.getElementById('paidTemplate');
    const watiEl  = document.getElementById('paidWati');
    const batchEl = document.getElementById('remBatch');
    const freeBatch = document.getElementById('batch');
    if (tplEl)    { tplEl.selectedIndex   = 0; }
    if (watiEl)   { watiEl.selectedIndex  = 0; }
    if (batchEl)  { batchEl.selectedIndex = 0; }
    if (freeBatch){ freeBatch.selectedIndex = 0; }
    // Reset text fields
    setVal('sentCount', '');  setVal('expectedCount', '');
    setVal('yesterdayCount', ''); setVal('campaignName', '');
    setVal('paidYestCount', '');
    renderCampRows(); updateTotal(); onTemplateChange();
    lastBcTime = null;
    lastBcDate = null;
    filledSlots.clear();
    await chrome.storage.local.remove('autoExtracted');
    updatePreview();
    showFeedback('✅ Cleared!', 'success');
  });
  document.getElementById('scanBtn').addEventListener('click', scanPage);
  document.getElementById('saveBtn').addEventListener('click', saveToDashboard);
  document.getElementById('addCampBtn').addEventListener('click', addCamp);

  // FREE rows — one-time event delegation (survives innerHTML re-renders)
  const freeRowsEl = document.getElementById('freeRows');
  freeRowsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (!isNaN(idx)) removeFreeRow(idx);
  });
  freeRowsEl.addEventListener('input', e => {
    const el = e.target; const idx = parseInt(el.dataset.idx); const field = el.dataset.field;
    if (isNaN(idx) || !field || el.tagName === 'SELECT') return;
    freeBroadcasts[idx][field] = el.value;
    updatePreview(); saveData();
  });
  freeRowsEl.addEventListener('change', e => {
    const el = e.target; const idx = parseInt(el.dataset.idx); const field = el.dataset.field;
    if (isNaN(idx) || !field) return;
    freeBroadcasts[idx][field] = el.value;
    if (field === 'cid' && !freeBroadcasts[idx].wati) freeBroadcasts[idx].wati = getWatiFromCid(el.value);
    if (field === 'type' || field === 'cid') renderFreeRows();
    updatePreview(); saveData();
  });

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
   'sunAttSent','sunAttExp','sunMilSent','sunMilExp','sunHindiSent','sunHindiExp',
   'paidYestCount','simpleTimePrefix','simpleNote',
   'extraWaterSent','extraWaterYest','extraEmailSent','extraEmailExp','extraEmailYest',
   'extraSESent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { updatePreview(); saveData(); });
  });
  ['attendBatch','att3Wati','remBatch',
   'extraWaterTime','extraWaterWati','extraEmailTime','extraEmailBatch','extraSEBatch','extraSEWati'].forEach(id => {
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

  // Auto-fill when content.js extracts counts after Stats click
  // Only fires when sentCount is ready (second storage write after waitForStats resolves)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.autoExtracted) return;
    const newVal = changes.autoExtracted.newValue;
    if (!newVal || !newVal.sentCount) return; // skip initial Stats-click write (no counts yet)
    const age = Date.now() - (newVal.extractedAt || 0);
    if (age > 120000) return; // ignore stale data (> 2 min old)
    fillFields(newVal);
    const msg = document.getElementById('autoMsg');
    if (msg) { msg.textContent = '✅ Auto-extracted values from Stats!'; msg.style.display = 'block'; }
  });
});
