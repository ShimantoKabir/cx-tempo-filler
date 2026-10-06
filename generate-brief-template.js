// Dev-only tool (not loaded by the extension itself — not in manifest.json)
// that builds the example XLSX brief workbook from template.json's sample
// data, using the same xlsx-modules.js schema popup.js uses to parse an
// uploaded workbook back into brandPage JSON. Run with:
//   node generate-brief-template.js
// Regenerate this whenever a module's fields in xlsx-modules.js change, so
// the example stays in sync with what the parser actually understands.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// xlsx.full.min.js is a browser bundle (assigns `window.XLSX`) — load it
// under a vm sandbox with a stubbed window/self so it still works in Node,
// same approach confirmed working when this was tested interactively.
function loadBundledXlsxLib() {
  const src = fs.readFileSync(path.join(__dirname, 'xlsx.full.min.js'), 'utf8');
  // The bundle's UMD footer checks `typeof exports !== 'undefined'` FIRST
  // (before module.exports/window) and, if truthy, mutates that object
  // directly — so a plain Node `exports` stub (not `module.exports`) is
  // where the real API ends up, not `XLSX`/`window.XLSX` as the bundle's
  // own fallback branches would otherwise suggest.
  const sandbox = { console, exports: {}, window: {}, self: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.exports;
}

const XLSX = loadBundledXlsxLib();
const { brandPageToSheets, XLSX_MODULES } = require('./xlsx-modules.js');

const template = JSON.parse(fs.readFileSync(path.join(__dirname, 'template.json'), 'utf8'));
const brandPage = template.brandPage;

const workbook = XLSX.utils.book_new();

// Instructions sheet first — plain text, no module mapping, just read by a
// human opening the file.
const instructionsRows = [
  { Field: 'How to use this workbook' },
  { Field: '1. Fill in the "Page Info" sheet with the real Page ID and Brand Name.' },
  { Field: '2. Each other sheet is one module type — one row per module instance.' },
  { Field: '3. Leave a sheet empty (just the header row) if that module isn\'t used.' },
  { Field: '4. "Need Edit Web"/"Need Edit App" columns take TRUE or FALSE.' },
  { Field: '5. Multi-line cells (ingredients, directions, SKUs) take one item per line within the cell — use Alt+Enter in Excel to add a line break.' },
  { Field: '6. Leave unused columns blank rather than deleting them — the parser expects every column to exist.' },
  { Field: 'This example is pre-filled with template.json\'s sample data (Reebok) — replace it with real content.' },
];
const instructionsSheet = XLSX.utils.json_to_sheet(instructionsRows, { header: ['Field'], skipHeader: true });
XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

// Page Info sheet — the two brandPage fields that live outside every
// module (pageId/brandName), one row.
const pageInfoHeaders = ['Page ID', 'Brand Name'];
const pageInfoSheet = XLSX.utils.json_to_sheet(
  [{ 'Page ID': brandPage.pageId || '', 'Brand Name': brandPage.brandName || '' }],
  { header: pageInfoHeaders }
);
XLSX.utils.book_append_sheet(workbook, pageInfoSheet, 'Page Info');

// One sheet per module, column order pinned to each module's own field
// list (json_to_sheet would otherwise infer order from the first row's
// own key insertion order, which happens to match today but pinning it
// explicitly is the actual guarantee).
const sheetsByName = brandPageToSheets(brandPage);
XLSX_MODULES.forEach((mod) => {
  const headers = mod.fields.map((f) => f.header);
  const rows = sheetsByName[mod.sheetName];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.book_append_sheet(workbook, sheet, mod.sheetName);
});

// XLSX.writeFile relies on auto-detecting Node's fs module, which doesn't
// work from inside the vm sandbox used to load the bundle (no `require`
// available there) — write the buffer out directly instead.
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
const outputPath = path.join(__dirname, 'brief-template.xlsx');
fs.writeFileSync(outputPath, buffer);
console.log('Wrote', outputPath, 'with sheets:', workbook.SheetNames.join(', '));
