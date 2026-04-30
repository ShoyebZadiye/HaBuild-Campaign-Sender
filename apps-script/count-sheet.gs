// ═══════════════════════════════════════════════════════
// HaBuild Count Sheet – Apps Script Webhook
// Paste this code in: Extensions → Apps Script
// Deploy as: Web App → Execute as: Me → Access: Anyone
// ═══════════════════════════════════════════════════════

const HEADER_ROW    = 2;  // Row 2 has dates
const DATA_START    = 3;  // Data rows start at row 3
const DATE_COL_FROM = 6;  // Dates start at column F (index 6, 1-based)

function doGet() {
  return jsonResponse({ ok: true, message: 'HaBuild Count Sheet webhook ready ✅' });
}

function doPost(e) {
  try {
    const { entries } = JSON.parse(e.postData.contents);
    if (!entries || !entries.length) return jsonResponse({ ok: true, updated: 0 });

    const sheet      = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const lastCol    = sheet.getLastColumn();
    const lastRow    = sheet.getLastRow();
    const headerVals = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
    const dataVals   = sheet.getRange(DATA_START, 1, lastRow - DATA_START + 1, 2).getValues();

    // Aggregate entries that land on the same cell (e.g. YE + Hindi reminder at same time)
    const cellTotals = {}; // "row_col" → total sent

    entries.forEach(entry => {
      const sent = parseInt(entry.sent) || 0;
      if (sent <= 0) return;

      const colNum = findDateCol(headerVals, entry.date);
      if (!colNum) return;

      const time12 = entry._bcTime ? to12h(entry._bcTime) : null;
      const rowNum  = findRow(dataVals, entry.msgname, time12);
      if (!rowNum) return;

      const key = rowNum + '_' + colNum;
      cellTotals[key] = (cellTotals[key] || 0) + sent;
    });

    let updated = 0;
    const debugInfo = [];
    Object.entries(cellTotals).forEach(([key, total]) => {
      const [r, c] = key.split('_').map(Number);
      sheet.getRange(r, c).setValue(total);
      updated++;
      debugInfo.push({ row: r, col: c, sent: total,
        rowName: sheet.getRange(r, 1).getValue(),
        rowTime: sheet.getRange(r, 2).getValue(),
        colHeader: sheet.getRange(HEADER_ROW, c).getValue() + ''
      });
    });

    return jsonResponse({ ok: true, updated, debug: debugInfo });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Find date column (1-based) ─────────────────────────
// Searches RIGHT-TO-LEFT because today's date is always near the end
// Handles both DD/MM/YYYY and MM/DD/YYYY text + Date objects
function findDateCol(header, dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  const targetDDMM = `${d}/${m}/${y}`;  // "30/04/2026"
  const targetMMDD = `${m}/${d}/${y}`;  // "04/30/2026"
  const targetDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

  for (let c = header.length - 1; c >= DATE_COL_FROM - 1; c--) {
    const cell = header[c];
    if (!cell) continue;
    if (cell instanceof Date) {
      if (cell.getFullYear() === targetDate.getFullYear() &&
          cell.getMonth()    === targetDate.getMonth()    &&
          cell.getDate()     === targetDate.getDate())    return c + 1;
    } else {
      const s = String(cell).trim();
      if (s === targetDDMM || s === targetMMDD) return c + 1;
    }
  }
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Convert "HH:MM" (24h) → "H:MM am/pm" ─────────────
function to12h(t) {
  if (!t || !t.includes(':')) return null;
  const [hh, mm] = t.split(':');
  let h = parseInt(hh);
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return h + ':' + (mm || '00') + ' ' + ampm;
}

// ── Map msgname → category for row matching ────────────
function entryCategory(msgname) {
  const n = (msgname || '').toLowerCase();
  if (n.includes('sunday_attendance') || n.includes('hindi_sunday') || n.includes('saturday_combine'))
    return 'saturday_combine';
  if (n.includes('night_absent') || n.includes('combine_absent') ||
      (n.includes('absent') && (n.includes('night') || n.includes('combine'))))
    return 'combine_absent';
  if (n.includes('night_present') || (n.includes('night') && n.includes('present')))
    return 'night_present';
  if (n.includes('saturday_reminder'))  return 'saturday_reminder';
  if (n.includes('sunday_intension'))   return 'sunday_intension';
  if (n.includes('milestone'))          return 'milestone';
  if (n.includes('attendance') || n.includes('tracker')) return 'attendance';
  if (n.includes('_se') || n.includes('se_') || n.includes('ds') || n.includes('strong'))
    return 'ds_class';
  return 'yoga_class';
}

// ── Map sheet row name → category ─────────────────────
function rowCategory(rowName) {
  const n = (rowName || '').toLowerCase();
  if (n.includes('combine absent'))     return 'combine_absent';
  if (n.includes('absent') && !n.includes('combine')) return 'yoga_absent';
  if (n.includes('saturday combine'))   return 'saturday_combine';
  if (n.includes('night message'))      return 'night_present';
  if (n.includes('saturday reminder'))  return 'saturday_reminder';
  if (n.includes('sunday intension'))   return 'sunday_intension';
  if (n.includes('milestone'))          return 'milestone';
  if (n.includes('attendance'))         return 'attendance';
  if (n.includes('ds-class') || n.includes('ds class')) return 'ds_class';
  if (n.includes('class message') || n.includes('routine')) return 'yoga_class';
  return 'other';
}

// ── Normalize time: remove leading zero, lowercase ────
// "05:20 am" → "5:20 am",  "4:20 pm" → "4:20 pm"
function normTime(t) {
  return String(t || '').trim().toLowerCase().replace(/^0(\d:)/, '$1');
}

// ── Find matching sheet row (1-based row number) ───────
function findRow(dataVals, msgname, time12) {
  const cat     = entryCategory(msgname);
  const timeLow = time12 ? normTime(time12) : null;

  // Pass 1: exact (time + category)
  if (timeLow) {
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      const time = normTime(dataVals[i][1]);
      if (!name || time !== timeLow) continue;
      if (rowCategory(name) === cat) return DATA_START + i;
    }
  }

  // Pass 2: time only (when unique)
  if (timeLow) {
    const hits = [];
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      const time = normTime(dataVals[i][1]);
      if (!name || time !== timeLow) continue;
      hits.push(DATA_START + i);
    }
    if (hits.length === 1) return hits[0];
  }

  // Pass 3: name-only for rows without time (saturday combine, etc.)
  if (cat === 'saturday_combine') {
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      if (rowCategory(name) === 'saturday_combine') return DATA_START + i;
    }
  }

  return null;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
