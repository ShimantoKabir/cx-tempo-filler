// Fills the Accordion module form after ModuleFinder has added and opened
// it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt, "accordion" is actually TWO different CMS module types
// under one brief-level concept — not a device-selector variant of the
// same module (unlike hero-pov.js/skinny-banner.js): app uses the
// "Accordion" module (module find key "Accordion"), web uses the "FAQ"
// module (module find key "FAQ", search text "(FAQ)") — same pattern as
// pov-card.js's web/app module-key branching, handled in
// page-id-founder.js's ModuleFinder dispatch. The two have entirely
// different field naming (sections/text/detailText vs
// faqList/questionText/paragraph), different tag types (<input> vs
// <textarea>), and different max lengths at the detail level (125 vs
// 2000) — see DEVICE_FIELDS below. No images/links in either variant.
//
// Both share the same two-level repeating structure: an unlimited list of
// "sections" (FAQ items on web), and within EACH an unlimited list of
// "details" (answer paragraphs on web). detailText/paragraph shares the
// same data-e2eid across every detail within a section (same
// "disambiguate only by the wrapper" pattern as Hub Spoke's categories),
// so it needs a wrapper div to tell them apart — the section's own heading
// (text/questionText) only ever appears once per section, so it needs no
// such scoping. Section 0 / detail 0 are assumed to exist by default when
// the module opens (same assumption used for every other module's
// card/row 0) — extra sections need the generic "add group" button, extra
// details within a section need their own "add detail" button (scoped to
// that section's detail-0 wrapper per scratch.txt).

class Accordion {
  // "Unlimited" per scratch.txt for both levels — these are safety caps
  // against a runaway loop, not real business limits like HubSpoke's
  // MAX_ROWS=5.
  static MAX_SECTIONS = 50;
  static MAX_DETAILS_PER_SECTION = 50;

  // Shared across both devices — module name/title use identical selectors
  // in both variants per scratch.txt.
  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    titleEn: 'input[data-e2eid="title"]',
    titleFr: 'input[data-e2eid="fr_title"]',
    addSectionButton: 'div.add-group-button',
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  // Per-device field naming for the two-level sections/details structure —
  // see the file header for why these are two different CMS modules, not
  // a selector variant of one.
  static DEVICE_FIELDS = {
    app: {
      detailWrapper: (sectionPos, detailPos) => `div[test-dataid="sections-${sectionPos},details,${detailPos}"]`,
      sectionFields: (sectionPos) => ({
        textEn: `input[data-e2eid="sections-sections-${sectionPos}-text"]`,
        textFr: `input[data-e2eid="sections-sections-${sectionPos}-fr_text"]`,
        textMaxLen: 125,
      }),
      detailFields: (sectionPos, wrapper) => ({
        detailTextEn: `${wrapper} input[data-e2eid="sections-sections-${sectionPos}-detailText"]`,
        detailTextFr: `${wrapper} input[data-e2eid="sections-sections-${sectionPos}-fr_detailText"]`,
        detailTextMaxLen: 125,
      }),
      addDetailButtonSuffix: '>div>span>button.add-group-button-right',
      sectionDeleteLabelMatch: 'Accordion Sections',
    },
    web: {
      detailWrapper: (sectionPos, detailPos) =>
        `div[test-dataid="faqList-${sectionPos},answerParagraphs,${detailPos}"]`,
      sectionFields: (sectionPos) => ({
        textEn: `textarea[data-e2eid="faqList-faqList-${sectionPos}-questionText"]`,
        textFr: `textarea[data-e2eid="faqList-faqList-${sectionPos}-fr_questionText"]`,
        textMaxLen: 125,
      }),
      detailFields: (sectionPos, wrapper) => ({
        detailTextEn: `${wrapper} textarea[data-e2eid="faqList-faqList-${sectionPos}-paragraph"]`,
        detailTextFr: `${wrapper} textarea[data-e2eid="faqList-faqList-${sectionPos}-fr_paragraph"]`,
        detailTextMaxLen: 2000,
      }),
      addDetailButtonSuffix: '>div>span>button.add-group-button-right',
      sectionDeleteLabelMatch: 'FAQ Links',
    },
  };

  static addDetailButton = (deviceType, sectionPos) => {
    const fields = Accordion.DEVICE_FIELDS[deviceType];
    return `${fields.detailWrapper(sectionPos, 0)}${fields.addDetailButtonSuffix}`;
  };

  // Edit mode only (see module-editor.js): same generic "delete repeatable
  // group" component every other module uses (dragElementWrapper +
  // deleteGroupButton + confirmDeleteGroupButton), filtered by label text
  // that differs per device ("Accordion Sections" vs "FAQ Links" per
  // scratch.txt). Deleting a section removes its nested details too, so
  // details don't need their own delete handling.
  static SECTION_DELETE_SELECTORS = {
    wrapper: 'div.dragElementWrapper',
    deleteIcon: 'svg.deleteGroupButton',
    confirmButton: 'button.confirmDeleteGroupButton',
  };

  static findSectionWrappers = (deviceType) => {
    const labelMatch = Accordion.DEVICE_FIELDS[deviceType].sectionDeleteLabelMatch;
    return [...document.querySelectorAll(Accordion.SECTION_DELETE_SELECTORS.wrapper)].filter((el) =>
      el.textContent.includes(labelMatch)
    );
  };

  static deleteExistingSections = async (deviceType) => {
    const count = Accordion.findSectionWrappers(deviceType).length;
    Helper.log(`Found ${count} existing section(s) to delete.`);

    for (let i = 0; i < count; i++) {
      const sections = Accordion.findSectionWrappers(deviceType);
      if (sections.length === 0) break;

      const section = sections[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        section.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = section.querySelector(Accordion.SECTION_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing section ${i + 1} of ${count}: ${section.textContent}`);
      // deleteBtn is an <svg> — unlike HTMLElement, SVGElement has no
      // .click() method, so a real click must be dispatched instead.
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const confirmBtn = await Helper.waitForElement(Accordion.SECTION_DELETE_SELECTORS.confirmButton);
      confirmBtn.click();
      await Helper.sleep(500);
    }
  };

  // Module name/title aren't behind any "add section" group, so the
  // delete-group mechanism above doesn't touch them — clear them directly
  // instead (same pattern as inspiration-module.js). Identical selectors
  // on both devices, per scratch.txt.
  static clearModuleFields = async () => {
    const keys = ['moduleName', 'titleEn', 'titleFr'];
    for (const key of keys) {
      try {
        const el = await Helper.waitForElement(Accordion.SELECTORS[key], 2000);
        await Helper.setInputValue(el, '');
      } catch {
        // Field doesn't exist — skip it.
      }
    }
  };

  static prepareForEdit = async (deviceType) => {
    await Accordion.deleteExistingSections(deviceType);
    await Accordion.clearModuleFields();
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[Accordion] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await Accordion.setValue(selector, v);
  };

  // Fills one section's heading (text/questionText) plus every one of its
  // details (detailText/paragraph), clicking "add detail" for each one
  // beyond the first.
  static fillSection = async (deviceType, sectionPos, sectionData) => {
    if (!sectionData) return;
    const deviceFields = Accordion.DEVICE_FIELDS[deviceType];

    const fields = deviceFields.sectionFields(sectionPos);
    await Accordion.setTruncated(fields.textEn, sectionData.text?.english, fields.textMaxLen);
    await Accordion.setTruncated(fields.textFr, sectionData.text?.french, fields.textMaxLen);

    const details = Array.isArray(sectionData.details)
      ? sectionData.details.slice(0, Accordion.MAX_DETAILS_PER_SECTION)
      : [];

    for (let detailPos = 0; detailPos < details.length; detailPos++) {
      if (detailPos > 0) {
        const addBtn = await Helper.waitForElement(Accordion.addDetailButton(deviceType, sectionPos));
        addBtn.click();
        await Helper.sleep(300);
      }
      const detailData = details[detailPos];
      if (!detailData) continue;
      const wrapper = deviceFields.detailWrapper(sectionPos, detailPos);
      const detailFields = deviceFields.detailFields(sectionPos, wrapper);
      await Accordion.setTruncated(
        detailFields.detailTextEn,
        detailData.detailText?.english,
        detailFields.detailTextMaxLen
      );
      await Accordion.setTruncated(
        detailFields.detailTextFr,
        detailData.detailText?.french,
        detailFields.detailTextMaxLen
      );
    }
  };

  // Errors intentionally propagate to the caller — same convention as every
  // other module's run().
  // brandPage.accordion is an array of independent module instances (same
  // "multi" pattern as itemCarousel/hubSpokeCard/inspirationModule) — index
  // picks which one. Works on both web and app — no device restriction
  // (see file header: two different CMS modules, not a restricted one).
  // sectionsPreExist defaults true (a freshly-created module already has
  // section 0 / detail 0 sitting there empty). ModuleEditor passes false
  // after deleteExistingSections() wipes every section — so section 0
  // needs its own "add section" click too.
  // navigateBackAfterSave defaults true (Create mode needs to go back to
  // find the next module) — ModuleEditor passes false.
  static run = async (deviceType, brandPage, index, sectionsPreExist = true, navigateBackAfterSave = true) => {
    const entry = brandPage.accordion?.[index];
    if (!entry) throw new Error(`Brief is missing accordion[${index}] data`);

    const sections = Array.isArray(entry.sections) ? entry.sections.slice(0, Accordion.MAX_SECTIONS) : [];
    if (sections.length === 0) throw new Error(`accordion[${index}].sections is empty`);

    Helper.log('Filling Accordion module...');

    // When the brief has more than one Accordion, append a 1-based sequence
    // number so the generated names aren't all identical (same convention
    // as item-carousel.js/hub-spoke-card.js/inspiration-module.js).
    const total = Array.isArray(brandPage.accordion) ? brandPage.accordion.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'accordion', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }

    for (let sectionPos = 0; sectionPos < sections.length; sectionPos++) {
      if (sectionPos > 0 || !sectionsPreExist) {
        const addBtn = await Helper.waitForElement(Accordion.SELECTORS.addSectionButton);
        addBtn.click();
        await Helper.sleep(300);
      }
      await Accordion.fillSection(deviceType, sectionPos, sections[sectionPos]);
      Helper.log(`Filled section ${sectionPos + 1} of ${sections.length}.`);
    }

    // Default to "Shop" / "Magasiner" when the brief omits a title (same
    // default as hub-spoke.js/hub-spoke-card.js/inspiration-module.js).
    await Accordion.setValue(Accordion.SELECTORS.titleEn, entry.title?.english || 'Shop');
    await Accordion.setValue(Accordion.SELECTORS.titleFr, entry.title?.french || 'Magasiner');
    Helper.log('Filled title.');

    // Module name filled last of all — per established convention — once
    // every section is done, rather than up front (see
    // Helper.setModuleName's own retry/verify logic for why this field
    // needs special handling).
    await Helper.setModuleName(Accordion.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    // Click a dummy field via CDP to force a real blur on whatever was last
    // focused, before handing off for review — catches any field that only
    // commits its value on blur rather than on input/change.
    await Helper.blurActiveFieldViaDummyInput();

    Helper.log('Accordion filled — review and click Save (or Discard Changes) to continue.');
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `accordion-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(Accordion.SELECTORS.saveButton, Accordion.SELECTORS.discardButton, moduleRecord);
  };
}
