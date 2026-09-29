// Parses the selected workbook via SheetJS (xlsx.full.min.js, loaded before
// this script in popup.html). Converts each sheet into a sparse
// {row, cells: {"A2": value, ...}} list — only cells that actually hold a
// value are included, matching the shape used to review the brief data.
let selectedBriefFile = null;
let selectedBriefData = null;

// Single source of truth for module key -> display label, mirroring
// page-id-founder.js's buildModuleDescriptors on the content-script side.
// heroPov is an array, so its presence check differs from the plain-object
// Skinny Banner modules. itemCarousel is also an array, but unlike heroPov
// (whose entries are cards within ONE module save) each itemCarousel entry
// is a fully separate module instance — so it's marked "multi" to get one
// checklist row (and one moduleKey/completion flag) per entry instead of one
// row for the whole array.
const MODULE_DEFS = [
  { key: 'imageAndTextSkinnyBanner', label: 'Image + Text Skinny Banner' },
  { key: 'textOnlySkinnyBanner', label: 'Text Only Skinny Banner' },
  {
    key: 'heroPov',
    label: 'Hero POV',
    isPresent: (brandPage) => Array.isArray(brandPage.heroPov) && brandPage.heroPov.length > 0,
    // heroPov's completion flags live on each card, not on brandPage.heroPov
    // itself — all cards get the same value (see downloadOutputJson), so
    // checking the first one is enough.
    isFullyCompleted: (brandPage) => {
      const card = brandPage.heroPov?.[0];
      return Boolean(card?.isCompletedForWeb && card?.isCompletedForApp);
    },
  },
  { key: 'hubSpokesNM', label: 'Hub Spokes NxM' },
  { key: 'povCard', label: 'POV Card' },
  { key: 'itemCarousel', label: 'Item Carousel', multi: true },
];

function isModulePresent(def, brandPage) {
  return def.isPresent ? def.isPresent(brandPage) : Boolean(brandPage[def.key]);
}

// True once a module has been completed for both device types, based on the
// isCompletedForWeb/isCompletedForApp flags an earlier run's output.json
// would have stamped in (if that file gets re-uploaded as the next brief).
function isModuleFullyCompleted(def, brandPage) {
  if (def.isFullyCompleted) return def.isFullyCompleted(brandPage);
  const module = brandPage[def.key];
  return Boolean(module?.isCompletedForWeb && module?.isCompletedForApp);
}

// Expands a def into the checklist rows it contributes: one row for an
// ordinary module, or one row per array entry for a "multi" def — matching
// page-id-founder.js's buildModuleDescriptors moduleKey scheme
// (`${key}-${index}`) so selectedModules filtering lines up on both sides.
function getModuleInstances(def, brandPage) {
  if (def.multi) {
    const list = brandPage[def.key];
    if (!Array.isArray(list)) return [];
    return list.map((entry, index) => ({
      moduleKey: `${def.key}-${index}`,
      label: `${def.label} #${index + 1}`,
      isFullyCompleted: Boolean(entry?.isCompletedForWeb && entry?.isCompletedForApp),
    }));
  }

  if (!isModulePresent(def, brandPage)) return [];
  return [{ moduleKey: def.key, label: def.label, isFullyCompleted: isModuleFullyCompleted(def, brandPage) }];
}

function detectBriefModules(brandPage) {
  return MODULE_DEFS.flatMap((def) => getModuleInstances(def, brandPage)).map((inst) => inst.label);
}

// Renders one checkbox per module instance found in the brief (checked by
// default) so the user can opt specific ones out before running the
// automation.
function renderModuleChecklist(brandPage) {
  const container = document.getElementById('moduleChecklist');
  container.innerHTML = '';

  const instances = MODULE_DEFS.flatMap((def) => getModuleInstances(def, brandPage));
  if (instances.length === 0) return;

  const heading = document.createElement('label');
  heading.textContent = 'Modules to run';
  container.appendChild(heading);

  instances.forEach((inst) => {
    const row = document.createElement('div');
    row.className = 'row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.moduleKey = inst.moduleKey;
    checkbox.id = `module-${inst.moduleKey}`;

    if (inst.isFullyCompleted) {
      checkbox.disabled = true;
    }

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = inst.isFullyCompleted ? `${inst.label} (already completed)` : inst.label;

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  });
}

function getSelectedModules() {
  const checkboxes = document.querySelectorAll('#moduleChecklist input[type="checkbox"]');
  if (checkboxes.length === 0) return null;
  // Disabled boxes are "already completed for both device types" markers,
  // not a real selection — checked-but-disabled shouldn't re-run the module.
  return Array.from(checkboxes)
    .filter((cb) => cb.checked && !cb.disabled)
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
