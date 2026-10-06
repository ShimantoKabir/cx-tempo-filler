// Maps brandPage's JSON shape <-> a human-friendly XLSX workbook (one
// sheet per module type, one row per module instance), so a brief author
// who doesn't want to hand-edit JSON can use a spreadsheet instead. Loaded
// in popup.html (browser) and also require()-able from Node (the
// generate-brief-template.js script that builds the example workbook) —
// hence the UMD-style export at the bottom instead of `export`/`import`.
//
// Every module's field list here is an explicit, ordered array of column
// descriptors (header + get/set against a dot-path) rather than a fully
// generic recursive flatten — deliberately, so each module's spreadsheet
// shape is something a human can review line-by-line against its actual
// content-script fields (hero-pov.js, hub-spoke.js, etc.), not inferred by
// reflection.

// Dot-path get/set — numeric path segments create/index arrays, anything
// else creates/indexes plain objects. "cards.0.image.web.english.mobile"
// reaches brandPage.heroPov[i].cards[0].image.web.english.mobile once
// rooted at one module entry.
function xlsxGetPath(obj, path) {
  return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function xlsxSetPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      cur[key] = value;
      return;
    }
    const nextIsArrayIndex = /^\d+$/.test(keys[i + 1]);
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = nextIsArrayIndex ? [] : {};
    }
    cur = cur[key];
  });
}

// True if every string reachable under value is blank/absent — used to
// trim trailing unused repeat-blocks (e.g. "Card 4"/"Card 5" columns left
// empty) back out of a fixed-length array after reading a row.
function xlsxIsBlank(value) {
  if (value == null || value === '') return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value === '';
  if (Array.isArray(value)) return value.every(xlsxIsBlank);
  if (typeof value === 'object') return Object.values(value).every(xlsxIsBlank);
  return false;
}

function xlsxTrimTrailingBlank(array) {
  const copy = [...array];
  while (copy.length > 0 && xlsxIsBlank(copy[copy.length - 1])) {
    copy.pop();
  }
  return copy;
}

// Field descriptor builders — each returns { header, get(entry), set(entry, value) }.
function textField(header, path) {
  return {
    header,
    get: (entry) => xlsxGetPath(entry, path) ?? '',
    set: (entry, value) => xlsxSetPath(entry, path, value == null ? '' : String(value).trim()),
  };
}

function boolField(header, path) {
  return {
    header,
    get: (entry) => Boolean(xlsxGetPath(entry, path)),
    set: (entry, value) => {
      const v = typeof value === 'boolean' ? value : String(value ?? '').trim().toUpperCase() === 'TRUE';
      xlsxSetPath(entry, path, v);
    },
  };
}

function numField(header, path) {
  return {
    header,
    get: (entry) => xlsxGetPath(entry, path) ?? '',
    set: (entry, value) => {
      const n = Number(value);
      xlsxSetPath(entry, path, value === '' || value == null || Number.isNaN(n) ? undefined : n);
    },
  };
}

// Brief's skus/ingredients/directions arrays are flattened to one
// newline-separated cell — same spirit as item-carousel.js already joining
// skus with ", " for the CMS's own comma-separated field, just newlines
// here since a cell can hold multi-line text and commas can appear inside
// a real ingredient/direction/sku.
function listField(header, path) {
  return {
    header,
    get: (entry) => {
      const arr = xlsxGetPath(entry, path);
      return Array.isArray(arr) ? arr.join('\n') : '';
    },
    set: (entry, value) => {
      const items = String(value ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      xlsxSetPath(entry, path, items);
    },
  };
}

// Builds one module's full field list by repeating a per-item field
// builder (itemFields(i) => field[]) for indices 0..max-1, prefixing each
// header with e.g. "Card 1 ", "Row 2 Col 3 ".
function repeatFields(max, itemFields) {
  const fields = [];
  for (let i = 0; i < max; i++) {
    fields.push(...itemFields(i));
  }
  return fields;
}

function buildRowFromEntry(fields, entry) {
  const row = {};
  fields.forEach((f) => {
    row[f.header] = f.get(entry);
  });
  return row;
}

function buildEntryFromRow(fields, row) {
  const entry = {};
  fields.forEach((f) => {
    f.set(entry, row[f.header]);
  });
  return entry;
}

// moduleDef = { sheetName, briefKey, fields, postProcess?(entry) }. One
// moduleDef per brandPage array key (brandPage.heroPov, brandPage.recipe,
// etc.) — see xlsx-modules.js for the full set.
function entriesToRows(moduleDef, brandPage) {
  const list = Array.isArray(brandPage[moduleDef.briefKey]) ? brandPage[moduleDef.briefKey] : [];
  return list.map((entry) => buildRowFromEntry(moduleDef.fields, entry));
}

function rowsToEntries(moduleDef, rows) {
  return rows.map((row) => {
    const entry = buildEntryFromRow(moduleDef.fields, row);
    return moduleDef.postProcess ? moduleDef.postProcess(entry) : entry;
  });
}

const XLSX_SCHEMA_UTILS = {
  xlsxGetPath,
  xlsxSetPath,
  xlsxIsBlank,
  xlsxTrimTrailingBlank,
  textField,
  boolField,
  numField,
  listField,
  repeatFields,
  buildRowFromEntry,
  buildEntryFromRow,
  entriesToRows,
  rowsToEntries,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XLSX_SCHEMA_UTILS;
} else {
  // Browser/content-script context — plain globals, same convention as
  // every other file in this extension (no bundler, no ES modules).
  Object.assign(typeof window !== 'undefined' ? window : globalThis, XLSX_SCHEMA_UTILS);
}
