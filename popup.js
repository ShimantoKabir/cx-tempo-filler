// Parses the selected workbook via SheetJS (xlsx.full.min.js, loaded before
// this script in popup.html). Converts each sheet into a sparse
// {row, cells: {"A2": value, ...}} list — only cells that actually hold a
// value are included, matching the shape used to review the brief data.
let selectedBriefFile = null;
let selectedBriefData = null;

// Single source of truth for module key -> display label, mirroring
// SkinnyBanner.moduleKeyForBannerType on the content-script side.
const MODULE_DEFS = [
  { key: 'imageAndTextSkinnyBanner', label: 'Image + Text Skinny Banner' },
  { key: 'textOnlySkinnyBanner', label: 'Text Only Skinny Banner' },
];

function detectBriefModules(brandPage) {
  return MODULE_DEFS.filter((def) => brandPage[def.key]).map((def) => def.label);
}

// Renders one checkbox per module found in the brief (checked by default) so
// the user can opt specific modules out before running the automation.
function renderModuleChecklist(brandPage) {
  const container = document.getElementById('moduleChecklist');
  container.innerHTML = '';

  const found = MODULE_DEFS.filter((def) => brandPage[def.key]);
  if (found.length === 0) return;

  const heading = document.createElement('label');
  heading.textContent = 'Modules to run';
  container.appendChild(heading);

  found.forEach((def) => {
    const row = document.createElement('div');
    row.className = 'row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.moduleKey = def.key;
    checkbox.id = `module-${def.key}`;

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = def.label;

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  });
}

function getSelectedModules() {
  const checkboxes = document.querySelectorAll('#moduleChecklist input[type="checkbox"]');
  if (checkboxes.length === 0) return null;
  return Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.moduleKey);
}

function parseBriefJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(JSON.parse(event.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function sheetToRows(worksheet) {
  const rows = [];
  const ref = worksheet['!ref'];
  if (!ref) return rows;

  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (cell && cell.v !== undefined && cell.v !== '') {
        cells[addr] = cell.v;
      }
    }
    if (Object.keys(cells).length > 0) {
      rows.push({ row: r + 1, cells });
    }
  }
  return rows;
}

function parseBriefWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheets = {};
        workbook.SheetNames.forEach((name) => {
          sheets[name] = sheetToRows(workbook.Sheets[name]);
        });
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

document.getElementById('briefFile').addEventListener('change', async (event) => {
  const statusEl = document.getElementById('status');
  selectedBriefFile = event.target.files[0] || null;
  selectedBriefData = null;
  document.getElementById('moduleChecklist').innerHTML = '';
  if (!selectedBriefFile) return;

  statusEl.textContent = `Selected: ${selectedBriefFile.name}`;
  statusEl.style.color = '#555';

  const summaryEl = document.getElementById('briefSummary');

  if (selectedBriefFile.name.toLowerCase().endsWith('.json')) {
    try {
      selectedBriefData = await parseBriefJson(selectedBriefFile);
      console.log('Parsed brief JSON:', selectedBriefData);

      const brand = selectedBriefData.brandPage || {};
      const modules = detectBriefModules(brand);
      renderModuleChecklist(brand);

      if (brand.pageId) {
        document.getElementById('pageId').value = brand.pageId;
      }

      statusEl.textContent = `Parsed "${selectedBriefFile.name}".`;
      statusEl.style.color = '#2e7d32';
      summaryEl.textContent =
        `Page ID: ${brand.pageId || 'N/A'}\n` +
        `Brand Name: ${brand.brandName || 'N/A'}\n` +
        `Modules found: ${modules.length}${modules.length ? ' (' + modules.join(', ') + ')' : ''}`;
    } catch (err) {
      console.error('[CX Tempo Filler] Failed to parse JSON brief', err);
      statusEl.textContent = 'Failed to parse JSON: ' + err.message;
      statusEl.style.color = '#d32f2f';
      summaryEl.textContent = '';
      selectedBriefData = null;
    }
    return;
  }

  if (typeof XLSX === 'undefined') {
    statusEl.textContent = 'xlsx.full.min.js is missing from the extension folder — cannot parse.';
    statusEl.style.color = '#d32f2f';
    return;
  }

  try {
    const sheets = await parseBriefWorkbook(selectedBriefFile);
    console.log('Parsed brief workbook:', sheets);

    statusEl.textContent = `Parsed "${selectedBriefFile.name}" — ${Object.keys(sheets).length} sheet(s).`;
    statusEl.style.color = '#2e7d32';

    const summaryLines = Object.entries(sheets).map(
      ([name, rows]) => `${name}: ${rows.length} row(s) with data`
    );
    summaryEl.textContent = summaryLines.join('\n');
  } catch (err) {
    console.error('[CX Tempo Filler] Failed to parse workbook', err);
    statusEl.textContent = 'Failed to parse workbook: ' + err.message;
    statusEl.style.color = '#d32f2f';
    summaryEl.textContent = '';
  }
});

document.getElementById('startBtn').addEventListener('click', () => {
  const deviceType = document.getElementById('deviceType').value;
  const pageId = document.getElementById('pageId').value.trim();
  const autoSubmit = document.getElementById('autoSubmit').checked;
  const statusEl = document.getElementById('status');

  if (!pageId) {
    statusEl.textContent = 'Please enter a Page ID.';
    statusEl.style.color = '#d32f2f';
    return;
  }

  statusEl.textContent = 'Opening form...';
  statusEl.style.color = '#555';

  const selectedModules = getSelectedModules();

  chrome.runtime.sendMessage(
    {
      action: 'startAutomation',
      payload: { deviceType, pageId, autoSubmit, briefData: selectedBriefData, selectedModules },
    },
    (resp) => {
      if (resp && resp.status === 'ok') {
        statusEl.textContent = 'Running in the opened tab...';
      } else {
        statusEl.textContent = 'Something went wrong starting the tab.';
        statusEl.style.color = '#d32f2f';
      }
    }
  );
});
