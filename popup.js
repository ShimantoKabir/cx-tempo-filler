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
//
// hasAppUrl marks which modules have an app link field at all — those get
// a second "Add gbo=1" checkbox under their row, since that's a per-module
// decision (gbo=1 forces a link to open externally instead of staying
// in-app, which most briefs don't want). Defaults to true; only
// itemCarousel (skus/title/subtitle, no URL field) opts out.
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
  { key: 'itemCarousel', label: 'Item Carousel', multi: true, hasAppUrl: false },
  // App-only (no web variant per scratch.txt) — appOnly hides it from the
  // checklist entirely when Device Type is "web", rather than showing it
  // and relying on runModules() to skip it at run time.
  { key: 'hubSpokeCard', label: 'Hub Spoke Card', multi: true, appOnly: true },
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
// An appOnly def contributes nothing at all when deviceType is "web".
function getModuleInstances(def, brandPage, deviceType) {
  if (def.appOnly && deviceType !== 'app') return [];

  const hasAppUrl = def.hasAppUrl !== false;

  if (def.multi) {
    const list = brandPage[def.key];
    if (!Array.isArray(list)) return [];
    return list.map((entry, index) => ({
      moduleKey: `${def.key}-${index}`,
      label: `${def.label} #${index + 1}`,
      isFullyCompleted: Boolean(entry?.isCompletedForWeb && entry?.isCompletedForApp),
      hasAppUrl,
    }));
  }

  if (!isModulePresent(def, brandPage)) return [];
  return [
    {
      moduleKey: def.key,
      label: def.label,
      isFullyCompleted: isModuleFullyCompleted(def, brandPage),
      hasAppUrl,
    },
  ];
}

function detectBriefModules(brandPage, deviceType) {
  return MODULE_DEFS.flatMap((def) => getModuleInstances(def, brandPage, deviceType)).map((inst) => inst.label);
}

// Renders one checkbox per module instance found in the brief (checked by
// default) so the user can opt specific ones out before running the
// automation. In Edit mode this renders radio buttons instead (shared
// "name" so the browser enforces single-select) since editing is restricted
// to exactly one existing module at a time — there's no ModuleFinder search/
// add step to loop over multiple in that flow (see module-editor.js).
function renderModuleChecklist(brandPage) {
  const container = document.getElementById('moduleChecklist');
  container.innerHTML = '';

  const deviceType = document.getElementById('deviceType').value;
  const isEditMode = document.getElementById('mode').value === 'edit';
  // Edit mode only supports Hub Spokes NxM and Hub Spoke Card so far (see
  // module-editor.js) — restrict the picker itself rather than letting the
  // user select an unsupported kind and hit an error mid-run.
  const EDIT_SUPPORTED_KEYS = ['hubSpokesNM', 'hubSpokeCard'];
  const defs = isEditMode ? MODULE_DEFS.filter((def) => EDIT_SUPPORTED_KEYS.includes(def.key)) : MODULE_DEFS;
  const instances = defs.flatMap((def) => getModuleInstances(def, brandPage, deviceType));
  if (instances.length === 0) return;

  const heading = document.createElement('label');
  heading.textContent = isEditMode ? 'Module to edit' : 'Modules to run';
  container.appendChild(heading);

  instances.forEach((inst) => {
    const group = document.createElement('div');
    group.className = 'module-group';

    const row = document.createElement('div');
    row.className = 'row';

    const checkbox = document.createElement('input');
    checkbox.type = isEditMode ? 'radio' : 'checkbox';
    if (isEditMode) checkbox.name = 'editModuleChoice';
    checkbox.checked = !isEditMode;
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
    group.appendChild(row);

    // Per-module gbo=1 opt-in — only for modules with an app link field,
    // and only when running against app (it's meaningless for web). Off by
    // default: gbo=1 forces the link open externally instead of staying
    // in-app, which most briefs don't want.
    if (inst.hasAppUrl && deviceType === 'app') {
      const gboRow = document.createElement('div');
      gboRow.className = 'row gbo-row';

      const gboCheckbox = document.createElement('input');
      gboCheckbox.type = 'checkbox';
      gboCheckbox.dataset.gboKey = inst.moduleKey;
      gboCheckbox.id = `gbo-${inst.moduleKey}`;
      if (inst.isFullyCompleted) {
        gboCheckbox.disabled = true;
      }

      const gboLabel = document.createElement('label');
      gboLabel.htmlFor = gboCheckbox.id;
      gboLabel.textContent = 'Add gbo=1 to app links (opens externally)';

      gboRow.appendChild(gboCheckbox);
      gboRow.appendChild(gboLabel);
      group.appendChild(gboRow);
    }

    container.appendChild(group);
  });
}

// Selector deliberately omits [type="checkbox"] so this also matches the
// radio buttons renderModuleChecklist uses in Edit mode.
function getSelectedModules() {
  const checkboxes = document.querySelectorAll('#moduleChecklist input[data-module-key]');
  if (checkboxes.length === 0) return null;
  // Disabled boxes are "already completed for both device types" markers,
  // not a real selection — checked-but-disabled shouldn't re-run the module.
  return Array.from(checkboxes)
    .filter((cb) => cb.checked && !cb.disabled)
    .map((cb) => cb.dataset.moduleKey);
}

// Which modules the user opted to add gbo=1 to, by moduleKey — matches
// page-id-founder.js's descriptor moduleKey scheme so it can look this up
// per module when dispatching.
function getGboModules() {
  const checkboxes = document.querySelectorAll('#moduleChecklist input[type="checkbox"][data-gbo-key]');
  return Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.gboKey);
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

// Rebuilds the "Page ID / Brand Name / Modules found" summary text, reading
// the current Device Type so an appOnly module (e.g. Hub Spoke Card) drops
// out of the count when switched to "web" — kept in sync with
// renderModuleChecklist rather than only computed once at upload time.
function updateBriefSummary(brand) {
  const summaryEl = document.getElementById('briefSummary');
  const deviceType = document.getElementById('deviceType').value;
  const modules = detectBriefModules(brand, deviceType);
  summaryEl.textContent =
    `Page ID: ${brand.pageId || 'N/A'}\n` +
    `Brand Name: ${brand.brandName || 'N/A'}\n` +
    `Modules found: ${modules.length}${modules.length ? ' (' + modules.join(', ') + ')' : ''}`;
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
      renderModuleChecklist(brand);

      if (brand.pageId) {
        document.getElementById('pageId').value = brand.pageId;
      }

      statusEl.textContent = `Parsed "${selectedBriefFile.name}".`;
      statusEl.style.color = '#2e7d32';
      updateBriefSummary(brand);
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
  const mode = document.getElementById('mode').value;
  const deviceType = document.getElementById('deviceType').value;
  const statusEl = document.getElementById('status');

  if (mode === 'edit') {
    const editUrl = document.getElementById('editUrl').value.trim();
    if (!editUrl) {
      statusEl.textContent = 'Please enter the Edit Module URL.';
      statusEl.style.color = '#d32f2f';
      return;
    }

    const selectedModules = getSelectedModules();
    if (!selectedModules || selectedModules.length !== 1) {
      statusEl.textContent = 'Please select exactly one module to edit.';
      statusEl.style.color = '#d32f2f';
      return;
    }
    const moduleKey = selectedModules[0];
    const addGbo = getGboModules().includes(moduleKey);

    statusEl.textContent = 'Opening module...';
    statusEl.style.color = '#555';

    chrome.runtime.sendMessage(
      {
        action: 'startEditAutomation',
        payload: { deviceType, editUrl, briefData: selectedBriefData, moduleKey, addGbo },
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
    return;
  }

  const pageId = document.getElementById('pageId').value.trim();
  const autoSubmit = document.getElementById('autoSubmit').checked;

  if (!pageId) {
    statusEl.textContent = 'Please enter a Page ID.';
    statusEl.style.color = '#d32f2f';
    return;
  }

  statusEl.textContent = 'Opening form...';
  statusEl.style.color = '#555';

  const selectedModules = getSelectedModules();
  const gboModules = getGboModules();

  chrome.runtime.sendMessage(
    {
      action: 'startAutomation',
      payload: { deviceType, pageId, autoSubmit, gboModules, briefData: selectedBriefData, selectedModules },
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

// Toggles which fields are relevant for the selected mode: Edit Module has
// no Page Selection step (no Page ID / auto-submit), just a direct URL, and
// restricts the checklist to a single module (see renderModuleChecklist).
function updateModeUI() {
  const mode = document.getElementById('mode').value;
  const isEditMode = mode === 'edit';

  document.getElementById('pageIdRow').style.display = isEditMode ? 'none' : '';
  document.getElementById('editUrlRow').style.display = isEditMode ? '' : 'none';
  document.getElementById('autoSubmitRow').style.display = isEditMode ? 'none' : '';
  document.getElementById('startBtn').textContent = isEditMode ? 'Edit Module' : 'Open & Fill Form';

  if (selectedBriefData?.brandPage) {
    renderModuleChecklist(selectedBriefData.brandPage);
  }
}

document.getElementById('mode').addEventListener('change', updateModeUI);

// gbo rows and appOnly modules (e.g. Hub Spoke Card) are app-only —
// switching Device Type re-renders the checklist and summary so they
// show/hide immediately, without needing to re-upload the brief. This does
// reset any checklist selections made so far (a full re-render, not a
// patch), which only matters if the user adjusts checkboxes before settling
// on a device type.
document.getElementById('deviceType').addEventListener('change', () => {
  if (selectedBriefData?.brandPage) {
    renderModuleChecklist(selectedBriefData.brandPage);
    updateBriefSummary(selectedBriefData.brandPage);
  }
});
