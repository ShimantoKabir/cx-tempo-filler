// Fills a YouTube embed via the generic "Custom HTML" module, web only (per
// scratch.txt: "this module is only for web"). Unlike every other module,
// Custom HTML has no dedicated per-field selectors in the CMS — it's just
// two markup textareas (en/fr) that this class fills with a hand-built
// iframe embed, swapping in the brief's video ID per language.
//
// module search text: "Custom HTML", module find key: "CustomHtml" (see
// scratch.txt) — page-id-founder.js calls ModuleFinder.run with those
// before handing off to Youtube.run.

class Youtube {
  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    markupEn: 'textarea[data-e2eid="markup"]',
    markupFr: 'textarea[data-e2eid="fr_markup"]',
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  // Per scratch.txt's captured template — identical for both languages,
  // only the video ID differs.
  static buildEmbedHtml = (videoId) => `<div style="padding-top:2rem;padding-bottom:1rem;">
        <div style="width: 75%; margin: 0px auto; position: relative; padding-bottom: 42.20%;">
            <iframe
                allowfullscreen
                src="https://www.youtube.com/embed/${videoId}?rel=0"
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
            </iframe>
        </div>
    </div>`;

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  // Errors intentionally propagate to the caller — same convention as every
  // other module — so a failure stops the loop instead of continuing on to
  // fill a module that was never actually added.
  // navigateBackAfterSave defaults true (Create mode's loop needs to go
  // back and find the next module) — ModuleEditor passes false, since Edit
  // mode is done with exactly one module and there's nothing to go back to
  // find.
  // brandPage.youtube is an array of independent module instances (same
  // "multi" pattern as itemCarousel/hubSpokeCard) — index picks which one.
  static run = async (deviceType, brandPage, index, navigateBackAfterSave = true) => {
    if (deviceType !== 'web') {
      throw new Error('Youtube (Custom HTML embed) is web-only — page-id-founder.js should never call this for app.');
    }

    const youtube = brandPage.youtube?.[index];
    if (!youtube) throw new Error(`Brief is missing youtube[${index}] data`);
    if (!youtube.englishId && !youtube.frenchId) {
      throw new Error('youtube.englishId / youtube.frenchId are both empty in the brief');
    }

    Helper.log('Filling YouTube (Custom HTML) module...');

    // When the brief has more than one YouTube embed, append a 1-based
    // sequence number so the generated names aren't all identical (same
    // convention as item-carousel.js/hub-spoke-card.js).
    const total = Array.isArray(brandPage.youtube) ? brandPage.youtube.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'youtube', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }
    await Youtube.setValue(Youtube.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    await Youtube.setValue(Youtube.SELECTORS.markupEn, Youtube.buildEmbedHtml(youtube.englishId || ''));
    await Youtube.setValue(Youtube.SELECTORS.markupFr, Youtube.buildEmbedHtml(youtube.frenchId || ''));
    Helper.log('Filled en/fr HTML markup.');

    Helper.log('YouTube module filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `youtube-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(
      Youtube.SELECTORS.saveButton,
      Youtube.SELECTORS.discardButton,
      navigateBackAfterSave,
      moduleRecord
    );
  };
}
