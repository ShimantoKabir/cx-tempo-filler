// Entry point for the CX Tempo Page Filler content script.
// Listens for the popup's "runAutomation"/"runEditAutomation" messages and
// kicks off the fill sequence. Also the single place that resumes after a
// tenant-selection reload (both PageIdFounder's create flow and
// ModuleEditor's edit flow save resume state under the same key — reading
// it here once and routing by its "mode" avoids both classes racing to
// consume it independently). Loaded after page-id-founder.js and
// module-editor.js so both classes are defined (see manifest.json).

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'runAutomation') {
    new PageIdFounder(msg.payload).run();
    sendResponse({ status: 'started' });
  } else if (msg.action === 'runEditAutomation') {
    new ModuleEditor(msg.payload).run();
    sendResponse({ status: 'started' });
  }
});

(async () => {
  const state = Helper.loadResumeState();
  if (!state) return;
  if (state.mode === 'edit') {
    if (state.stage === 'onModulePage') {
      await new ModuleEditor(state).runOnModulePage();
    } else {
      await new ModuleEditor(state).runAfterTenant();
    }
  } else {
    await new PageIdFounder(state).runFromPageType();
  }
})();
