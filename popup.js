// A brief can be uploaded as JSON or as an XLSX workbook (see
// generate-brief-template.js for the expected sheet layout, built from
// xlsx-modules.js's schema) — both parse down to the same
// { brandPage: {...} } shape in selectedBriefData, so every downstream
// step (renderModuleChecklist, validateBrief, updateBriefSummary, Start)
// doesn't need to know which format was uploaded.
let selectedBriefFile = null;
let selectedBriefData = null;

// Brief-level sanity checks, run once right after a JSON brief is parsed —
// catches data-shape mistakes early, in the popup, instead of only
// surfacing as a broken live module partway through a run. Per explicit
// request this is meant to grow over time: each entry is independent, so
// adding a new rule later is just one more object in this array, not a
// rewrite of how checking/display works.
const BRIEF_VALIDATORS = [
  {
    name: 'brandPage.pageId is required',
    check: (brandPage) => (brandPage.pageId ? [] : ['brandPage.pageId is missing — Build mode needs it.']),
  },
  {
    // Every other module's image field is a CMS asset search term
    // (searchText), resolved through the image picker — Recipe is a raw
    // Custom HTML <img src="..."> (see recipe.js's buildRecipeHtml), so it
    // needs an actual reachable URL, not a filename/search term.
    name: 'recipe.image must be a full image URL',
    check: (brandPage) => {
      const issues = [];
      const recipes = Array.isArray(brandPage.recipe) ? brandPage.recipe : [];
      recipes.forEach((entry, index) => {
        ['english', 'french'].forEach((lang) => {
          const value = entry?.image?.[lang];
          if (value && !/^https?:\/\//i.test(value)) {
            issues.push(
              `recipe[${index}].image.${lang} should be a full image URL (e.g. "https://..."), not a CMS search term — got "${value}"`
            );
          }
        });
      });
      return issues;
    },
  },
  {
    // Per card: web (en/fr × mobile/desktop) + app (en/fr × mobile/tablet)
    // = 8 image slots (see hero-pov.js's SELECTORS / template.json's
    // heroPov card shape) — *AltCopy siblings aren't images, not checked
    // here. A blank slot means that device/language combination renders
    // with no image at all.
    name: 'heroPov cards must have all 8 images filled',
    check: (brandPage) => {
      const issues = [];
      const slots = [
        ['web', 'english', 'mobile'],
        ['web', 'english', 'desktop'],
        ['web', 'french', 'mobile'],
        ['web', 'french', 'desktop'],
        ['app', 'english', 'mobile'],
        ['app', 'english', 'tablet'],
        ['app', 'french', 'mobile'],
        ['app', 'french', 'tablet'],
      ];
      const instances = Array.isArray(brandPage.heroPov) ? brandPage.heroPov : [];
      instances.forEach((instance, instanceIndex) => {
        const cards = Array.isArray(instance?.cards) ? instance.cards : [];
        cards.forEach((card, cardIndex) => {
          slots.forEach(([device, lang, slot]) => {
            const value = card?.image?.[device]?.[lang]?.[slot];
            if (!value) {
              issues.push(
                `heroPov[${instanceIndex}].cards[${cardIndex}].image.${device}.${lang}.${slot} is empty — all 8 image slots must be filled.`
              );
            }
          });
        });
      });
      return issues;
    },
  },
];

function validateBrief(brandPage) {
  return BRIEF_VALIDATORS.flatMap((validator) => validator.check(brandPage));
}

// Single source of truth for module key -> display label, mirroring
// page-id-founder.js's buildModuleDescriptors on the content-script side.
// Every module key in the brief is an array of independent module instances
// (its own add/fill/save cycle) — even a module that's conceptually "just
// one" is a single-entry array, so getModuleInstances below has a single
// path: one checklist row per array entry, keyed by index
// (`${key}-${index}`) to match buildModuleDescriptors' moduleKey scheme.
//
// hasAppUrl marks which modules have an app link field at all — those get
// a second "Add gbo=1" checkbox under their row, since that's a per-module
// decision (gbo=1 forces a link to open externally instead of staying
// in-app, which most briefs don't want). Defaults to true; only
// itemCarousel (skus/title/subtitle, no URL field) opts out.
const MODULE_DEFS = [
  { key: 'imageAndTextSkinnyBanner', label: 'Image + Text Skinny Banner' },
  { key: 'textOnlySkinnyBanner', label: 'Text Only Skinny Banner' },
  { key: 'heroPov', label: 'Hero POV' },
  // Hidden from the checklist entirely when Device Type is "app" per
  // explicit request — webOnly hides it the same way youtube/recipe/
  // inspirationModule are hidden below, even though HubSpoke.run() itself
  // still technically supports an app run (selectors are identical for
  // web/app per hub-spoke.js) — this only restricts what the popup offers.
  { key: 'hubSpokeNM', label: 'Hub Spoke NxM', webOnly: true },
  { key: 'povCard', label: 'POV Card' },
  { key: 'itemCarousel', label: 'Item Carousel', hasAppUrl: false },
  // App-only (no web variant per scratch.txt) — appOnly hides it from the
  // checklist entirely when Device Type is "web", rather than showing it
  // and relying on runModules() to skip it at run time.
  { key: 'hubSpokeCard', label: 'Hub Spoke Card', appOnly: true },
  // Web-only (per scratch.txt: "this module is only for web") — both are a
  // generic Custom HTML module, not their own CMS module kind, so
  // Youtube.run/Recipe.run build the whole markup themselves.
  { key: 'youtube', label: 'YouTube Embed', hasAppUrl: false, webOnly: true },
  { key: 'recipe', label: 'Recipe', hasAppUrl: false, webOnly: true },
  { key: 'inspirationModule', label: 'Inspiration Module', hasAppUrl: false, webOnly: true },
  // No device restriction — two different CMS modules under one brief key
  // (Accordion on app, FAQ on web), not an app-only module. No link/CTA
  // field at all in either variant, so no gbo checkbox.
  { key: 'accordion', label: 'Accordion', hasAppUrl: false },
];

// Build-completion tracking lives in chrome.storage now, not in the brief
// (isCompletedForWeb/App, needEditForWeb/App used to be hand-maintained
// fields a brief author had no real way to keep accurate) — written by
// Helper.saveModuleRecord in helper.js right after a Create-mode save,
// keyed by pageId+deviceType+moduleKey so it's known before the generated
// module name/URL ever exist. Duplicated here (not shared via import) since
// popup.js and the content scripts are loaded in entirely separate
// contexts — this is the full extent of the overlap, not worth pulling in
// all of helper.js just for three lines.
const MODULE_RECORDS_KEY = 'cxtfModuleRecords';

function moduleRecordKey(pageId, deviceType, moduleKey) {
  return `${pageId}:${deviceType}:${moduleKey}`;
}

function getModuleRecords() {
  return new Promise((resolve) => {
    chrome.storage.local.get(MODULE_RECORDS_KEY, (result) => {
      resolve(result[MODULE_RECORDS_KEY] || {});
    });
  });
}

// Expands a def into the checklist rows it contributes: one row per array
// entry, matching page-id-founder.js's buildModuleDescriptors moduleKey
// scheme (`${key}-${index}`) so selectedModules filtering lines up on both
// sides. An appOnly/webOnly def contributes nothing at all on the wrong
// device type. records defaults to {} so detectBriefModules (which only
// needs labels, not build status) can call this without touching storage.
function getModuleInstances(def, brandPage, deviceType, records = {}) {
  if (def.appOnly && deviceType !== 'app') return [];
  if (def.webOnly && deviceType !== 'web') return [];

  const hasAppUrl = def.hasAppUrl !== false;
  const list = brandPage[def.key];
  if (!Array.isArray(list)) return [];

  return list.map((entry, index) => {
    const moduleKey = `${def.key}-${index}`;
    const record = records[moduleRecordKey(brandPage.pageId, deviceType, moduleKey)] || null;
    return {
      moduleKey,
      label: `${def.label} #${index + 1}`,
      hasAppUrl,
      record,
    };
  });
}

function detectBriefModules(brandPage, deviceType) {
  return MODULE_DEFS.flatMap((def) => getModuleInstances(def, brandPage, deviceType)).map((inst) => inst.label);
}

// Sends the startEditAutomation message with a known URL/moduleKey —
// shared by the inline "Edit" button (Build mode, module already has a
// record) and the manual Edit Module URL flow (startBtn's edit branch).
function runEditAutomation(deviceType, editUrl, moduleKey, addGbo) {
  const statusEl = document.getElementById('status');
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
}

// Renders one radio button per module instance found in the brief — both
// modes are single-select (shared "name" so the browser enforces it): Edit
// mode because editing is restricted to exactly one existing module at a
// time (no ModuleFinder search/add step to loop over multiple — see
// module-editor.js), Create mode per explicit request, so a run only ever
// builds one module at a time instead of looping over everything checked.
//
// Build-completion is now tracked in chrome.storage (see
// Helper.saveModuleRecord in helper.js) rather than brief fields — a
// module instance with a record is edit-only from here on: its Build-mode
// radio is disabled and an inline "Edit" button appears instead, using the
// URL this extension already captured when it was built, with no need to
// switch to Edit mode or paste a URL at all.
async function renderModuleChecklist(brandPage) {
  const container = document.getElementById('moduleChecklist');
  container.innerHTML = '';

  const deviceType = document.getElementById('deviceType').value;
  const isEditMode = document.getElementById('mode').value === 'edit';
  // Edit mode only supports Hub Spokes NxM, Hub Spoke Card, Hero POV,
  // YouTube, Recipe, Skinny Banner (both variants), POV Card, Item
  // Carousel, Inspiration Module, and Accordion so far (see
  // module-editor.js) — restrict the picker itself rather than letting the
  // user select an unsupported kind and hit an error mid-run.
  const EDIT_SUPPORTED_KEYS = [
    'hubSpokeNM',
    'hubSpokeCard',
    'heroPov',
    'youtube',
    'recipe',
    'imageAndTextSkinnyBanner',
    'textOnlySkinnyBanner',
    'povCard',
    'itemCarousel',
    'inspirationModule',
    'accordion',
  ];
  const defs = isEditMode ? MODULE_DEFS.filter((def) => EDIT_SUPPORTED_KEYS.includes(def.key)) : MODULE_DEFS;
  const records = await getModuleRecords();
  const instances = defs.flatMap((def) => getModuleInstances(def, brandPage, deviceType, records));
  // Edit mode shows every supported-kind instance, same as before — a
  // module with no record still works, just via the manual Edit Module
  // URL field (gating the list on "has a record" would make editing
  // anything built before this feature existed, or on another
  // machine/profile, impossible from here).
  if (instances.length === 0) {
    // Render the "nothing to do" message into moduleChecklist itself
    // (rather than leaving it empty) so it's actually visible — the
    // :empty CSS rule in popup.html hides the container otherwise.
    if (isEditMode) {
      const message = document.createElement('div');
      message.style.color = '#d32f2f';
      message.textContent =
        'No Hub Spokes NxM / Hub Spoke Card / Hero POV / YouTube / Recipe / Skinny Banner / POV Card / Item Carousel / Inspiration Module / Accordion modules found in this brief.';
      container.appendChild(message);
    }
    return;
  }

  const heading = document.createElement('label');
  heading.textContent = isEditMode ? 'Module to edit' : 'Module to build';
  container.appendChild(heading);

  instances.forEach((inst) => {
    const group = document.createElement('div');
    group.className = 'module-group';

    const row = document.createElement('div');
    row.className = 'row';

    // A module with a known record gets the same inline "Edit" button in
    // both modes — clicking it jumps straight into editing with the URL
    // this extension already captured, no radio selection or manual URL
    // entry needed. Build mode additionally can't re-build it (radio
    // disabled, would duplicate the CMS module); Edit mode never could
    // "build" it to begin with, so there's nothing extra to lock there —
    // the radio simply isn't rendered for this row in either mode.
    const hasRecord = Boolean(inst.record);

    const checkbox = document.createElement('input');
    checkbox.type = 'radio';
    checkbox.name = 'moduleChoice';
    checkbox.disabled = hasRecord;
    // Auto-select when there's only one real choice — but never a disabled
    // (record-known) radio, since that would leave nothing usable selected
    // for runModules()/the manual Edit flow to act on.
    checkbox.checked = !hasRecord && instances.length === 1;
    checkbox.dataset.moduleKey = inst.moduleKey;
    checkbox.id = `module-${inst.moduleKey}`;

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = hasRecord
      ? `${inst.label} (${isEditMode ? 'ready to edit' : 'already built'})`
      : inst.label;

    row.appendChild(checkbox);
    row.appendChild(label);

    if (hasRecord) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'inline-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const addGbo = document.getElementById(`gbo-${inst.moduleKey}`)?.checked ?? false;
        runEditAutomation(deviceType, inst.record.url, inst.moduleKey, addGbo);
      });
      row.appendChild(editBtn);
    }

    group.appendChild(row);

    // Per-module gbo=1 opt-in — only for modules with an app link field,
    // and only when running against app (it's meaningless for web). Off by
    // default: gbo=1 forces the link open externally instead of staying
    // in-app, which most briefs don't want. Still shown for an
    // already-built module — the inline Edit button reads it too, in case
    // the app link needs to change on this edit pass.
    if (inst.hasAppUrl && deviceType === 'app') {
      const gboRow = document.createElement('div');
      gboRow.className = 'row gbo-row';

      const gboCheckbox = document.createElement('input');
      gboCheckbox.type = 'checkbox';
      gboCheckbox.dataset.gboKey = inst.moduleKey;
      gboCheckbox.id = `gbo-${inst.moduleKey}`;

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

// Selector matches the radio buttons renderModuleChecklist renders for
// both modes — returns at most one moduleKey now that both are
// single-select, but stays an array since every call site already expects
// one (page-id-founder.js's selectedModules filter, the edit-mode
// "exactly one" check).
function getSelectedModules() {
  const radios = document.querySelectorAll('#moduleChecklist input[data-module-key]');
  if (radios.length === 0) return null;
  // Disabled radios are "already completed for both device types" markers,
  // not a real selection — checked-but-disabled shouldn't re-run the module.
  return Array.from(radios)
    .filter((r) => r.checked && !r.disabled)
    .map((r) => r.dataset.moduleKey);
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

// Converts an uploaded workbook (see generate-brief-template.js for the
// expected shape: a "Page Info" sheet plus one sheet per XLSX_MODULES
// entry) into the same { brandPage } shape parseBriefJson produces, via
// xlsx-modules.js's sheetsToBrandPage — so everything downstream
// (renderModuleChecklist, validateBrief, updateBriefSummary, Start) runs
// identically regardless of which file format was uploaded. A sheet
// missing or renamed just comes through as "no rows" for that module
// (sheetsToBrandPage already tolerates that), not a hard failure.
function parseBriefWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetsByName = {};
        workbook.SheetNames.forEach((name) => {
          if (name === 'Instructions' || name === 'Page Info') return;
          sheetsByName[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
        });

        const pageInfoRows = workbook.Sheets['Page Info']
          ? XLSX.utils.sheet_to_json(workbook.Sheets['Page Info'], { defval: '' })
          : [];
        const pageId = pageInfoRows[0]?.['Page ID'];
        const brandName = pageInfoRows[0]?.['Brand Name'];

        const brandPage = sheetsToBrandPage(sheetsByName, pageId, brandName);
        resolve({ brandPage });
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
  document.getElementById('briefIssues').textContent = '';
  // Disabled until parsing/validation below proves this file is actually
  // usable — safer default than leaving a stale "enabled" from whatever
  // was selected before.
  document.getElementById('startBtn').disabled = true;
  if (!selectedBriefFile) return;

  statusEl.textContent = `Selected: ${selectedBriefFile.name}`;
  statusEl.style.color = '#555';

  const summaryEl = document.getElementById('briefSummary');

  if (selectedBriefFile.name.toLowerCase().endsWith('.json')) {
    try {
      selectedBriefData = await parseBriefJson(selectedBriefFile);
      console.log('Parsed brief JSON:', selectedBriefData);

      const brand = selectedBriefData.brandPage || {};
      await renderModuleChecklist(brand);

      statusEl.textContent = `Parsed "${selectedBriefFile.name}".`;
      statusEl.style.color = '#2e7d32';
      updateBriefSummary(brand);

      // Surfaced separately from statusEl — the JSON itself parsed fine,
      // these are data-quality problems with its contents (see
      // BRIEF_VALIDATORS), which can pile up independently of parse status.
      // Any issue disables Start — running Build/Edit against a brief known
      // to have a problem risks a half-filled or broken live module.
      const issuesEl = document.getElementById('briefIssues');
      const issues = validateBrief(brand);
      issuesEl.textContent = issues.length ? `Brief issues:\n${issues.map((i) => `• ${i}`).join('\n')}` : '';
      document.getElementById('startBtn').disabled = issues.length > 0;
    } catch (err) {
      console.error('[CX Tempo Filler] Failed to parse JSON brief', err);
      statusEl.textContent = 'Failed to parse JSON: ' + err.message;
      statusEl.style.color = '#d32f2f';
      summaryEl.textContent = '';
      document.getElementById('briefIssues').textContent = '';
      document.getElementById('startBtn').disabled = true;
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
    selectedBriefData = await parseBriefWorkbook(selectedBriefFile);
    console.log('Parsed brief workbook:', selectedBriefData);

    const brand = selectedBriefData.brandPage || {};
    await renderModuleChecklist(brand);

    statusEl.textContent = `Parsed "${selectedBriefFile.name}".`;
    statusEl.style.color = '#2e7d32';
    updateBriefSummary(brand);

    // Same validation/Start-gating as the JSON path (see above) — same
    // brandPage shape either way, so the same checks apply.
    const issuesEl = document.getElementById('briefIssues');
    const issues = validateBrief(brand);
    issuesEl.textContent = issues.length ? `Brief issues:\n${issues.map((i) => `• ${i}`).join('\n')}` : '';
    document.getElementById('startBtn').disabled = issues.length > 0;
  } catch (err) {
    console.error('[CX Tempo Filler] Failed to parse workbook', err);
    statusEl.textContent = 'Failed to parse workbook: ' + err.message;
    statusEl.style.color = '#d32f2f';
    summaryEl.textContent = '';
    document.getElementById('briefIssues').textContent = '';
    document.getElementById('startBtn').disabled = true;
    selectedBriefData = null;
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

    runEditAutomation(deviceType, editUrl, moduleKey, addGbo);
    return;
  }

  // No manual Page ID field — brandPage.pageId is the only source now, so
  // Build mode requires an uploaded brief that actually has one.
  const pageId = selectedBriefData?.brandPage?.pageId;
  const autoSubmit = document.getElementById('autoSubmit').checked;

  if (!pageId) {
    statusEl.textContent = 'Upload a brief JSON with brandPage.pageId set before building.';
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

// Mode and Device Type together determine which brief fields/validators/
// checklist entries even apply (web vs app images, Edit's supported-kind
// filter, etc.) — rather than re-rendering the old brief under the new
// combination (and risking a stale checklist/validation result that no
// longer matches), changing either one discards the upload entirely and
// requires picking the file again. Also clears the native file input's
// value so re-selecting the exact same file still fires a "change" event.
function resetUploadedBrief() {
  selectedBriefFile = null;
  selectedBriefData = null;
  document.getElementById('briefFile').value = '';
  document.getElementById('status').textContent = '';
  document.getElementById('briefSummary').textContent = '';
  document.getElementById('briefIssues').textContent = '';
  document.getElementById('moduleChecklist').innerHTML = '';
  document.getElementById('startBtn').disabled = true;
}

// Toggles which fields are relevant for the selected mode: Edit Module has
// no Page Selection step (no auto-submit), just a direct URL, and
// restricts the checklist to a single module (see renderModuleChecklist).
function updateModeUI() {
  const mode = document.getElementById('mode').value;
  const isEditMode = mode === 'edit';

  document.getElementById('editUrlRow').style.display = isEditMode ? '' : 'none';
  document.getElementById('autoSubmitRow').style.display = isEditMode ? 'none' : '';
  document.getElementById('startBtn').textContent = isEditMode ? 'Edit Module' : 'Open & Fill Form';

  resetUploadedBrief();
}

document.getElementById('mode').addEventListener('change', updateModeUI);
document.getElementById('deviceType').addEventListener('change', resetUploadedBrief);

// Initial state on popup open — no brief uploaded yet, so Start has
// nothing to act on. updateModeUI() calls resetUploadedBrief() itself.
updateModeUI();
