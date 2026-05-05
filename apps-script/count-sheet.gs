// ═══════════════════════════════════════════════════════
// HaBuild Count Sheet – Apps Script Webhook
// Paste this code in: Extensions → Apps Script
// Deploy as: Web App → Execute as: Me → Access: Anyone
// ═══════════════════════════════════════════════════════

const HEADER_ROW    = 2;  // Row 2 has dates
const DATA_START    = 3;  // Data rows start at row 3
const DATE_COL_FROM = 6;  // Dates start at column F (index 6, 1-based)

function doGet() {
  return jsonResponse({ ok: true, message: 'HaBuild Count Sheet webhook ready ✅', version: '3.0' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // ── Extra Session entries → write to "Extra Sessions" tab ──
    if (body.extraEntries && body.extraEntries.length) {
      const added = writeExtraEntries(body.extraEntries);
      return jsonResponse({ ok: true, extra: added });
    }

    const { entries } = body;
    if (!entries || !entries.length) return jsonResponse({ ok: true, updated: 0 });

    const sheet      = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const lastCol    = sheet.getLastColumn();
    const lastRow    = sheet.getLastRow();
    const headerVals = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
    const dataVals   = sheet.getRange(DATA_START, 1, lastRow - DATA_START + 1, 2).getValues();

    // Aggregate entries that land on the same cell (e.g. YE + Hindi reminder at same time)
    const cellTotals = {}; // "row_col" → total sent
    let updated = 0;
    const debugInfo = [];

    entries.forEach(entry => {
      const sent = parseInt(entry.sent) || 0;
      if (sent <= 0) { debugInfo.push({ skip: 'sent=0', msgname: entry.msgname }); return; }

      const colNum = findDateCol(headerVals, entry.date);
      if (!colNum) { debugInfo.push({ skip: 'date_col_not_found', date: entry.date, msgname: entry.msgname }); return; }

      const time12 = entry._bcTime ? to12h(entry._bcTime) : null;
      const rowNum  = findRow(dataVals, entry.msgname, time12);
      if (!rowNum) {
        const sheetRows = debugInfo.some(d => d.sheetRows) ? undefined
          : dataVals.slice(0, 20).map(r => String(r[0]||'').trim()).filter(Boolean);
        debugInfo.push({ skip: 'row_not_found', msgname: entry.msgname, time12, cat: entryCategory(entry.msgname), sheetRows });
        return;
      }

      const key = rowNum + '_' + colNum;
      cellTotals[key] = (cellTotals[key] || 0) + sent;
    });
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
  // Sunday hourly tracker — must check BEFORE saturday_combine which also matches 'sunday_attendance'
  if (n.includes('sunday') && (n.includes('tracker') || n.includes('milestone')))
    return 'sunday_att';
  if (n.includes('sunday_attendance') || n.includes('hindi_sunday') || n.includes('saturday_combine'))
    return 'saturday_combine';
  if (n.includes('hindi') && (n.includes('absent') || n.includes('night_absent') || n.includes('combine_absent')))
    return 'hindi_night_absent';
  if (n.includes('hindi') && (n.includes('present') || n.includes('night_present')))
    return 'hindi_night_present';
  if (n.includes('night_absent') || n.includes('combine_absent') ||
      (n.includes('absent') && (n.includes('night') || n.includes('combine'))))
    return 'combine_absent';
  if (n.includes('night_present') || (n.includes('night') && n.includes('present')))
    return 'night_present';
  if (n.includes('saturday_reminder'))  return 'saturday_reminder';
  if (n.includes('sunday_intension'))   return 'sunday_intension';
  if (n.includes('hindi') && (n.includes('attendance') || n.includes('tracker')))
    return 'hindi_attendance';
  if (n.includes('milestone'))          return 'milestone';
  if (n.includes('attendance') || n.includes('tracker')) return 'attendance';
  if (n.includes('_se') || n.includes('se_') || n.includes('ds') || n.includes('strong'))
    return 'ds_class';
  return 'yoga_class';
}

// ── Map sheet row name → category ─────────────────────
function rowCategory(rowName) {
  const n = (rowName || '').toLowerCase();
  if (n.includes('hindi') && n.includes('absent'))                    return 'hindi_night_absent';
  if (n.includes('hindi') && n.includes('present'))                   return 'hindi_night_present';
  if (n.includes('night absent'))                                      return 'combine_absent';
  if (n.includes('sunday morning') || n.includes('sunday evening'))   return 'sunday_att';
  if (n.includes('saturday absent') || n.includes('saturday combine') ||
      n.includes('sunday attendance'))                                  return 'saturday_combine';
  if (n.includes('night present') || n.includes('night message'))     return 'night_present';
  if (n.includes('saturday present') || n.includes('saturday reminder')) return 'saturday_reminder';
  if (n.includes('sunday intension'))                                 return 'sunday_intension';
  if (n.includes('absent'))                                           return 'yoga_absent';
  if (n.includes('hindi') && n.includes('attendance'))                return 'hindi_attendance';
  if (n.includes('milestone'))                                        return 'milestone';
  if (n.includes('attendance'))                                       return 'attendance';
  if (n.includes('ds-class') || n.includes('ds class'))               return 'ds_class';
  // "Yoga - Reminder Message" = class message (renamed in sheet)
  if (n.includes('reminder message') || n.includes('class message') || n.includes('routine') ||
      (n.includes('reminder') && !n.includes('saturday') && !n.includes('night'))) return 'yoga_class';
  return 'other';
}

// ── Normalize time: remove leading zero, lowercase ────
// "05:20 am" → "5:20 am",  "4:20 pm" → "4:20 pm"
function normTime(t) {
  return String(t || '').trim().toLowerCase().replace(/^0(\d:)/, '$1');
}

// ── Parse sheet cell time (handles both text and Date objects) ────────────
// Google Sheets stores time as Date objects; text rows store as "H:MM am/pm"
function parseSheetTime(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    let h = val.getHours();
    const m = val.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }
  return normTime(String(val));
}

// ── Convert "H:MM am/pm" → total minutes (for fuzzy match) ───
function timeStrToMins(t) {
  const m = String(t || '').match(/(\d+):(\d+)\s*(am|pm)/i);
  if (!m) return -1;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const isPm = m[3].toLowerCase() === 'pm';
  if (isPm && h !== 12) h += 12;
  if (!isPm && h === 12) h = 0;
  return h * 60 + min;
}

// ── Find matching sheet row (1-based row number) ───────
function findRow(dataVals, msgname, time12) {
  const cat     = entryCategory(msgname);
  const timeLow = time12 ? normTime(time12) : null;

  // Pass 1: exact (time + category)
  if (timeLow) {
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      const time = parseSheetTime(dataVals[i][1]);
      if (!name || time !== timeLow) continue;
      if (rowCategory(name) === cat) return DATA_START + i;
    }
  }

  // Pass 2: time only (when unique)
  if (timeLow) {
    const hits = [];
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      const time = parseSheetTime(dataVals[i][1]);
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

  // Pass 3a: sunday_att — time is inside the row name ("Sunday EVENING 9:00 PM"), not col B
  if (cat === 'sunday_att' && timeLow) {
    for (let i = 0; i < dataVals.length; i++) {
      const name = String(dataVals[i][0] || '').trim();
      if (!name || rowCategory(name) !== 'sunday_att') continue;
      const m = name.match(/(\d+:\d+\s*(?:am|pm))/i);
      if (!m) continue;
      if (normTime(m[1]) === timeLow) return DATA_START + i;
    }
    // Fuzzy ±90 min from name time (handles stale lastBcTime)
    const curMins = timeStrToMins(timeLow);
    if (curMins >= 0) {
      let best = null, bestDiff = 999;
      for (let i = 0; i < dataVals.length; i++) {
        const name = String(dataVals[i][0] || '').trim();
        if (!name || rowCategory(name) !== 'sunday_att') continue;
        const m = name.match(/(\d+:\d+\s*(?:am|pm))/i);
        if (!m) continue;
        const rowMins = timeStrToMins(normTime(m[1]));
        const diff = Math.abs(rowMins - curMins);
        if (diff <= 90 && diff < bestDiff) { best = DATA_START + i; bestDiff = diff; }
      }
      if (best !== null) return best;
    }
  }

  // Pass 3.5: category-only when exactly one row has this category
  // Handles rows with no time in col B (e.g. "Yoga Attendance" with no time)
  const catHits = [];
  for (let i = 0; i < dataVals.length; i++) {
    const name = String(dataVals[i][0] || '').trim();
    if (!name) continue;
    if (rowCategory(name) === cat) catHits.push(DATA_START + i);
  }
  if (catHits.length === 1) return catHits[0];

  // Pass 4: ±90 min fuzzy time + category
  // Wide window handles stale lastBcTime (e.g. 6:05 PM stored but row is at 6:50 PM)
  if (timeLow) {
    const curMins = timeStrToMins(timeLow);
    if (curMins >= 0) {
      for (let i = 0; i < dataVals.length; i++) {
        const name    = String(dataVals[i][0] || '').trim();
        const rowTime = parseSheetTime(dataVals[i][1]);
        if (!name || !rowTime) continue;
        const rowMins = timeStrToMins(rowTime);
        if (rowMins < 0) continue;
        if (Math.abs(rowMins - curMins) <= 90 && rowCategory(name) === cat) return DATA_START + i;
      }
    }
  }

  return null;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Extra Sessions tab writer ──────────────────────────────────────
var EXTRA_SHEET_NAME   = 'Extra Sessions';
var SPREADSHEET_ID     = '17KV51RAjGrrCftIfei9obV-QXl1aC7AF6XAF0lUQsIU';

function writeExtraEntries(entries) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(EXTRA_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(EXTRA_SHEET_NAME);
    var hdr = sheet.getRange(1, 1, 1, 8);
    hdr.setValues([['Date','Time','Type','Batch','Sent','Expected','Diff','Yesterday']]);
    hdr.setFontWeight('bold').setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }

  var added = 0;
  entries.forEach(function(e) {
    var label = e.type === 'water' ? 'Water Reminder'
              : e.type === 'email' ? 'Email Reminder'
              : 'SE Attendance';
    sheet.appendRow([
      e.date      || '',
      e.time      || '',
      label,
      e.batch     || '',
      e.sent      || 0,
      e.expected  || '',
      e.diff      || '',
      e.yesterday != null ? e.yesterday : ''
    ]);
    // Color by type
    var color = e.type === 'water' ? '#e0f7fa'
              : e.type === 'email' ? '#e8eaf6'
              : '#f3e5f5';
    sheet.getRange(sheet.getLastRow(), 1, 1, 8).setBackground(color);
    added++;
  });
  return added;
}
