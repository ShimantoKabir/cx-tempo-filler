// Generic primitives for the "outline" XLSX/Google Sheet format — a
// human-readable layout (one row per field, labels stacked down column A,
// nested groups introduced by marker rows like "id"/"Card"/"Row"/"Section")
// as opposed to xlsx-schema.js's wide format (one row per module instance,
// one column per field). Confirmed against a real downloaded sheet's exact
// cell contents (not just a summarized read) before writing this — see
// xlsx-outline-modules.js for the per-module readers built on top of these.
//
// Row shape throughout: a 5-element array [A, B, C, D, E] (padded with ''
// if the sheet row was shorter). Two different "nothing here" markers
// appear in real sheets and mean different things:
//   - '' (truly blank)            -> "continuation of the row above" —
//                                     carry the previous row's context
//                                     forward at this column.
//   - '----------------------------' (a literal placeholder dash string)
//                                     -> "not applicable at this column for
//                                     this field" — a hard reset, nothing
//                                     to carry forward.
// normalizeCell collapses both to null so callers don't need to special-case
// which one a given sheet happened to use (real sheets are inconsistent
// about it — confirmed live, e.g. pov-card.js's "pov-style" uses blanks
// where "columns" uses dashes for the same kind of unused-column).

(function (global) {
  const DASH_PLACEHOLDER = '----------------------------';

  function normalizeCell(v) {
    if (v == null) return null;
    const s = typeof v === 'string' ? v.trim() : v;
    if (s === '' || s === DASH_PLACEHOLDER) return null;
    return s;
  }

  // Pads/truncates a raw sheet row to exactly 5 cells, normalized.
  function normalizeRow(row) {
    const cells = [0, 1, 2, 3, 4].map((i) => normalizeCell(row ? row[i] : null));
    return cells;
  }

  // The "value" for a row is whichever is the rightmost non-null cell among
  // columns B-E (index 1-4) — covers every leaf shape seen in real sheets:
  // "id" (value in B), "columns" (value in E, B-D are dash placeholders),
  // "pov-style" (value in B, C-E blank), "image ... mobile ..." (value in
  // E). Column A (index 0) is never the value — it's always the field
  // label.
  function rowValue(cells) {
    for (let i = 4; i >= 1; i--) {
      if (cells[i] != null) return cells[i];
    }
    return '';
  }

  // True if this row's column A (trimmed) equals the given label — used to
  // find marker rows ("id", "Card " with its trailing space, "Row",
  // "Section", "details", or a specific field label like "headline").
  function rowLabelIs(row, label) {
    const a = row && row[0] != null ? String(row[0]).trim() : '';
    return a === label;
  }

  // Splits `rows` into blocks at every row whose column A matches `label`
  // (e.g. "id", "Card ", "Row", "Section", "details") — each block is
  // { index, rows }, where `index` is that marker row's column B (the
  // human-assigned 1/2/3... number — not used for anything but logging,
  // since array position is what actually determines order) and `rows` is
  // every row strictly between this marker and the next one at the same
  // label (or the end of the input). The marker row itself is consumed,
  // not included in the block's rows. Only splits on this exact label —
  // other marker rows nested inside (e.g. "Card" blocks containing
  // "image"/"legal"/etc. field rows) are left alone, part of the block's
  // own content for a narrower splitBlocks call to handle.
  function splitBlocks(rows, label) {
    const blocks = [];
    let current = null;
    for (const row of rows) {
      if (rowLabelIs(row, label)) {
        if (current) blocks.push(current);
        current = { index: row[1], rows: [] };
      } else if (current) {
        current.rows.push(row);
      }
      // Rows before the first marker (if any) are ignored — every module's
      // outline always starts directly with its first marker row.
    }
    if (current) blocks.push(current);
    return blocks;
  }

  // Finds the first row (and its index within `rows`) whose column A
  // matches `label` — the common case of "a field that appears once in
  // this block" (e.g. finding "pov-style" within one Card's rows).
  function findLabelRow(rows, label) {
    const i = rows.findIndex((row) => rowLabelIs(row, label));
    return i === -1 ? null : { i, row: rows[i] };
  }

  // Reads a simple scalar field (e.g. "pov-style", "columns", "id") —
  // finds the row labeled `label` and returns its rowValue(), or '' if the
  // label isn't present in these rows at all.
  function readScalar(rows, label) {
    const found = findLabelRow(rows, label);
    return found ? rowValue(normalizeRow(found.row)) : '';
  }

  // Reads a plain { english, french } pair for a field that has no device
  // split — e.g. item-carousel's "title", hub-spoke's "name". The label
  // row itself carries english (column C === "english", value from
  // rowValue), and the very next row carries french (blank column A,
  // column C === "french"). Returns {english: '', french: ''} if the label
  // isn't found.
  // Deliberately reads column E directly (not rowValue's generic
  // rightmost-non-null scan) — once column C is confirmed to hold the
  // language marker, a rightmost scan starting there would fall back to
  // re-reading "english"/"french" itself as the "value" whenever the real
  // value cell is blank (confirmed via testing against a real sheet where
  // an unfilled field did exactly this).
  function readLangPair(rows, label) {
    const found = findLabelRow(rows, label);
    if (!found) return { english: '', french: '' };
    const result = { english: '', french: '' };
    const firstCells = normalizeRow(found.row);
    if (firstCells[2] === 'english') result.english = firstCells[4] != null ? firstCells[4] : '';
    const next = rows[found.i + 1];
    if (next) {
      const nextCells = normalizeRow(next);
      if (nextCells[0] == null && nextCells[2] === 'french') {
        result.french = nextCells[4] != null ? nextCells[4] : '';
      }
    }
    return result;
  }

  // Reads a field split by device (web/app) AND language (english/french),
  // where each (device, lang) leaf may itself span multiple sub-field rows
  // (e.g. skinny-banner's "headline" has text + text-color per language).
  // `subFields` lists which sub-field labels (column D) to collect for
  // each (device, lang) — e.g. ['text', 'text-color']. Devices present are
  // auto-detected from column B (only "web" and/or "app" are ever used) —
  // a field with no device split at all (column B is null throughout, e.g.
  // hub-spoke's "image") should use readLangGroup instead, not this.
  // Returns { web: { english: {...}, french: {...} }, app: { ... } },
  // omitting a device entirely if it never appears.
  function readDeviceLangGroup(rows, label, subFields) {
    const found = findLabelRow(rows, label);
    const result = {};
    if (!found) return result;

    let device = null;
    let lang = null;
    for (let i = found.i; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      // Stop once we hit the next different top-level label (column A set
      // to something other than blank/this label means we've left this
      // field's rows) — only the very first row is allowed to carry the
      // label itself.
      if (i > found.i && cells[0] != null) break;

      if (cells[1] != null) device = cells[1];
      if (cells[2] != null) lang = cells[2];
      if (device == null || lang == null) continue;

      const subField = cells[3];
      if (subField == null || !subFields.includes(subField)) continue;

      if (!result[device]) result[device] = {};
      if (!result[device][lang]) result[device][lang] = {};
      result[device][lang][subField] = cells[4] != null ? cells[4] : '';
    }
    return result;
  }

  // Reads a field split by language only (no device), where each language
  // leaf spans multiple sub-field rows — e.g. hub-spoke's "image"
  // (search-text/alt-copy/link-value per language, no web/app split).
  function readLangGroup(rows, label, subFields) {
    const found = findLabelRow(rows, label);
    const result = {};
    if (!found) return result;

    let lang = null;
    for (let i = found.i; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      if (i > found.i && cells[0] != null) break;

      if (cells[2] != null) lang = cells[2];
      if (lang == null) continue;

      const subField = cells[3];
      if (subField == null || !subFields.includes(subField)) continue;

      if (!result[lang]) result[lang] = {};
      result[lang][subField] = cells[4] != null ? cells[4] : '';
    }
    return result;
  }

  // Reads a multi-row list field (e.g. item-carousel's "skus", recipe's
  // "ingredients") — the label row's own value is the first item, and every
  // following row with a blank column A-D but a non-null column E is
  // another item, until a row with a non-null column A (or end of rows).
  function readList(rows, label) {
    const found = findLabelRow(rows, label);
    if (!found) return [];
    const items = [];
    const firstCells = normalizeRow(found.row);
    if (firstCells[4] != null) items.push(firstCells[4]);
    for (let i = found.i + 1; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      if (cells[0] != null) break;
      if (cells[4] != null) items.push(cells[4]);
    }
    return items;
  }

  // Reads a field split by device, where each device's value is EITHER a
  // {english, french} pair (lang column present) OR — per a real
  // confirmed case, pov-card.js's app-only eyebrow — a single flat value
  // with no language split at all for that device. Column D is never a
  // named subfield here (always the dash placeholder) — the value sits
  // directly in column E. Returns { web: {english,french}|string, app:
  // {...}|string }, mixing shapes per-device exactly as the source rows
  // do — callers already know (from each module's own field definition)
  // which shape to expect per device.
  function readDeviceLangFlat(rows, label) {
    const found = findLabelRow(rows, label);
    const result = {};
    if (!found) return result;

    let device = null;
    let lang = null;
    for (let i = found.i; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      if (i > found.i && cells[0] != null) break;
      // A fully blank row (the separator between fields) carries no new
      // info — unlike readDeviceLangGroup/readLangGroup, this function has
      // no subfield-name check to naturally skip it, so without this it
      // re-processes under whatever lang was last set and overwrites an
      // already-correct value with '' (confirmed via testing).
      if (cells.every((c) => c == null)) continue;

      if (cells[1] != null) {
        device = cells[1];
        lang = null;
      }
      if (cells[2] != null) lang = cells[2];
      if (device == null) continue;

      const value = cells[4] != null ? cells[4] : '';
      if (lang != null) {
        if (typeof result[device] !== 'object') result[device] = {};
        result[device][lang] = value;
      } else if (cells[4] != null) {
        result[device] = value;
      }
    }
    return result;
  }

  // Reads a list field split by language (e.g. recipe's "ingredients" —
  // several English lines, then several French lines) — unlike readList,
  // which has no language dimension at all (e.g. item-carousel's "skus").
  function readLangList(rows, label) {
    const found = findLabelRow(rows, label);
    const result = { english: [], french: [] };
    if (!found) return result;

    let lang = null;
    for (let i = found.i; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      if (i > found.i && cells[0] != null) break;
      if (cells[2] != null) lang = cells[2];
      if (lang == null) continue;
      if (cells[4] != null) result[lang].push(cells[4]);
    }
    return result;
  }

  const XLSX_OUTLINE_SCHEMA = {
    normalizeCell,
    normalizeRow,
    rowValue,
    rowLabelIs,
    splitBlocks,
    findLabelRow,
    readScalar,
    readLangPair,
    readDeviceLangFlat,
    readDeviceLangGroup,
    readLangGroup,
    readList,
    readLangList,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XLSX_OUTLINE_SCHEMA;
  } else {
    Object.assign(typeof window !== 'undefined' ? window : globalThis, XLSX_OUTLINE_SCHEMA);
  }
})(typeof window !== 'undefined' ? window : globalThis);
