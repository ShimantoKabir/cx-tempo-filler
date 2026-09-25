// Parses the selected workbook via SheetJS (xlsx.full.min.js, loaded before
// this script in popup.html). Converts each sheet into a sparse
// {row, cells: {"A2": value, ...}} list — only cells that actually hold a
// value are included, matching the shape used to review the brief data.
let selectedBriefFile = null;

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
  if (!selectedBriefFile) return;

  statusEl.textContent = `Selected: ${selectedBriefFile.name}`;
  statusEl.style.color = '#555';

  if (typeof XLSX === 'undefined') {
    statusEl.textContent = 'xlsx.full.min.js is missing from the extension folder — cannot parse.';
    statusEl.style.color = '#d32f2f';
    return;
  }

  const summaryEl = document.getElementById('briefSummary');

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

  chrome.runtime.sendMessage(
    { action: 'startAutomation', payload: { deviceType, pageId, autoSubmit } },
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
