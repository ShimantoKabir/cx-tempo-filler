// Fills the Hub Spoke Card module form after ModuleFinder has added and
// opened it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt: this module is APP-ONLY — there is no web variant
// documented. page-id-founder.js is responsible for skipping this module
// entirely on a web run; run() below just guards against being called with
// the wrong deviceType.
//
// brandPage.hubSpokeCard is an array where each entry is a fully separate
// module instance (own add/fill/save cycle) — same "multi" pattern as
// itemCarousel — and each instance holds its own "cards" array (up to 6,
// per scratch.txt's "max 6 card can be added: [0-5]"). Card index is baked
// directly into every field's data-e2eid (categoryCards-categoryCards-{i}),
// so no test-dataid scoping wrapper is needed (same as pov-card.js's app
// cards, unlike hub-spoke.js's categories which share one e2eid per row).
//
// Unlike Hero POV / Hub Spokes / POV Card (where only card 0 pre-exists),
// this module's UI already renders 4 empty cards (indices 0-3) on load —
// confirmed by testing, not scratch.txt. Only cards beyond that (4 and 5)
// need the "add" button clicked.

class HubSpokeCard {
  static MAX_CARDS = 6;
  static PRE_EXISTING_CARDS = 4;

  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    titleEn: 'input[data-e2eid="title"]',
    titleFr: 'input[data-e2eid="fr_title"]',
    addCardButton: 'div.add-group-button',
    card: (i) => ({
      image: {
        en: {
          open: `button[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="categoryCards-categoryCards-${i}-image-alt-text"]`,
        },
        fr: {
          open: `button[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_image-alt-text"]`,
        },
      },
      headingEn: `input[data-e2eid="categoryCards-categoryCards-${i}-title"]`,
      headingFr: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_title"]`,
      headingMaxLen: 41,
      linkValueEn: `textarea[data-e2eid="categoryCards-categoryCards-${i}-image-url-link"]`,
      linkValueFr: `textarea[data-e2eid="categoryCards-categoryCards-${i}-fr_image-url-link"]`,
    }),
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  // Edit mode only (see module-editor.js): an existing module may already
  // have cards with real data, which run()'s "first 4 cards already exist,
  // empty" assumption doesn't account for. Same generic "delete repeatable
  // group" component HubSpoke uses for rows (dragElementWrapper +
  // deleteGroupButton + confirmDeleteGroupButton) — confirmed via console on
  // the live page. Unlike Hub Spokes NxM, this module has no nested row
  // structure, so every dragElementWrapper on the page IS a card — no
  // label/field filter needed (confirmed via console: querying
  // div.dragElementWrapper directly returned exactly the 6 "Category Cards
  // N" groups, each with a resolvable deleteGroupButton).
  static CARD_DELETE_SELECTORS = {
    wrapper: 'div.dragElementWrapper',
    deleteIcon: 'svg.deleteGroupButton',
    confirmButton: 'button.confirmDeleteGroupButton',
  };

  static findCardWrappers = () => [...document.querySelectorAll(HubSpokeCard.CARD_DELETE_SELECTORS.wrapper)];

  static deleteExistingCards = async () => {
    // Count up front (confirmed via console against the live page: every
    // "Category Cards N" wrapper resolves a deleteGroupButton) rather than
    // looping on an arbitrary safety cap — gives a real expected count to
    // log progress against and to break early on if fewer cards delete
    // successfully than were actually found.
    const count = HubSpokeCard.findCardWrappers().length;
    Helper.log(`Found ${count} existing card(s) to delete.`);

    for (let i = 0; i < count; i++) {
      const cards = HubSpokeCard.findCardWrappers();
      if (cards.length === 0) break;

      const card = cards[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        card.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = card.querySelector(HubSpokeCard.CARD_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing card ${i + 1} of ${count}: ${card.textContent}`);
      // deleteBtn is an <svg> — unlike HTMLElement, SVGElement has no
      // .click() method, so a real click must be dispatched instead.
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const confirmBtn = await Helper.waitForElement(HubSpokeCard.CARD_DELETE_SELECTORS.confirmButton);
      confirmBtn.click();
      await Helper.sleep(500);
    }
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[HubSpokeCard] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await HubSpokeCard.setValue(selector, v);
  };

  // Split select-only / alt-text-only (same "images first" pattern as
  // hero-pov.js/hub-spoke.js): alt text only saves once an image is
  // actually selected, so run() selects every card's image first (nothing
  // else on the page yet to wipe), then fills alt text in a later pass
  // alongside the rest of each card's fields.
  static selectImage = async (cfg, data) => {
    if (!data || !data.searchText) return;

    const openBtn = await Helper.waitForElement(cfg.open);
    await Helper.clickTrusted(openBtn);
    await Helper.sleep(300);

    const searchInput = await Helper.waitForElement(cfg.search);
    await Helper.setInputValue(searchInput, data.searchText);

    const searchBtn = await Helper.waitForElement(cfg.searchBtn);
    await Helper.clickTrusted(searchBtn);

    const result = await Helper.waitForElement(cfg.result);
    await Helper.clickTrusted(result);
    Helper.log(`Selected image: ${data.searchText}`);
  };

  static fillImageAlt = async (cfg, data, altCopyContext) => {
    if (!data || !data.searchText) return;
    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await HubSpokeCard.setValue(cfg.altText, altText);
  };

  static selectCardImages = async (cardSel, cardData) => {
    await HubSpokeCard.selectImage(cardSel.image.en, cardData.image?.english);
    await HubSpokeCard.selectImage(cardSel.image.fr, cardData.image?.french);
  };

  static fillCardImageAlts = async (cardSel, cardData, brandName) => {
    const altCopyContext = (language) => ({ brandName, deviceType: 'app', language, moduleType: 'hub-spoke-card' });
    await HubSpokeCard.fillImageAlt(cardSel.image.en, cardData.image?.english, altCopyContext('english'));
    await HubSpokeCard.fillImageAlt(cardSel.image.fr, cardData.image?.french, altCopyContext('french'));
  };

  // Everything except image — deferred to run()'s later stage (see above).
  static fillCardNonImage = async (cardSel, cardData, addGbo) => {
    // Default to "Shop" / "Magasiner" when the brief omits a heading.
    await HubSpokeCard.setTruncated(cardSel.headingEn, cardData.heading?.english || 'Shop', cardSel.headingMaxLen);
    await HubSpokeCard.setTruncated(cardSel.headingFr, cardData.heading?.french || 'Magasiner', cardSel.headingMaxLen);

    // Always app (this module is app-only), so addGbo alone decides.
    const linkValue = (url) => (addGbo ? Helper.appendGboParam(url) : url || '');
    await HubSpokeCard.setValue(cardSel.linkValueEn, linkValue(cardData.linkValue?.english));
    await HubSpokeCard.setValue(cardSel.linkValueFr, linkValue(cardData.linkValue?.french));
  };

  // Errors intentionally propagate to the caller — same convention as every
  // other module — so a failure stops the loop instead of continuing on to
  // fill a module that was never actually added.
  // cardsPreExist defaults true (a freshly-created module already has cards
  // 0-3 sitting there empty, same assumption the rest of this function
  // makes). ModuleEditor passes false after deleteExistingCards() wipes
  // every card — so every index needs its own "add" click, not just cards
  // beyond PRE_EXISTING_CARDS.
  // navigateBackAfterSave defaults true (Create mode's multi-instance loop
  // needs to go back and find the next hubSpokeCard entry/module) —
  // ModuleEditor passes false, since Edit mode is done with exactly one
  // module and there's nothing to go back to find.
  static run = async (deviceType, brandPage, index, addGbo, cardsPreExist = true, navigateBackAfterSave = true) => {
    if (deviceType !== 'app') {
      throw new Error('HubSpokeCard is app-only — page-id-founder.js should never call this for web.');
    }

    const entry = brandPage.hubSpokeCard?.[index];
    if (!entry) throw new Error(`Brief is missing hubSpokeCard[${index}] data`);

    const cards = Array.isArray(entry.cards) ? entry.cards.slice(0, HubSpokeCard.MAX_CARDS) : [];
    if (cards.length === 0) throw new Error(`hubSpokeCard[${index}].cards is empty`);

    Helper.log('Filling Hub Spoke Card module...');

    // When the brief has more than one Hub Spoke Card, append a 1-based
    // sequence number so the generated names aren't all identical (same
    // convention as item-carousel.js).
    const total = Array.isArray(brandPage.hubSpokeCard) ? brandPage.hubSpokeCard.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'hub-spoke-card', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }

    // No intermediate save — per explicit request, same flow as
    // hero-pov.js/hub-spoke.js: every card's image selected first (nothing
    // else on the page yet to wipe), then a second pass fills everything
    // else — heading, link value, alt text — then title and module name
    // last of all.
    for (let i = 0; i < cards.length; i++) {
      if (i >= HubSpokeCard.PRE_EXISTING_CARDS || !cardsPreExist) {
        const addBtn = await Helper.waitForElement(HubSpokeCard.SELECTORS.addCardButton);
        addBtn.click();
        await Helper.sleep(300);
      }
      await HubSpokeCard.selectCardImages(HubSpokeCard.SELECTORS.card(i), cards[i]);
      Helper.log(`Selected images for card ${i + 1} of ${cards.length} (rest deferred).`);
    }

    for (let i = 0; i < cards.length; i++) {
      await HubSpokeCard.fillCardNonImage(HubSpokeCard.SELECTORS.card(i), cards[i], addGbo);
      await HubSpokeCard.fillCardImageAlts(HubSpokeCard.SELECTORS.card(i), cards[i], brandPage.brandName);
      Helper.log(`Filled remaining fields for card ${i + 1} of ${cards.length}.`);
    }

    await HubSpokeCard.setValue(HubSpokeCard.SELECTORS.titleEn, entry.title?.english || '');
    await HubSpokeCard.setValue(HubSpokeCard.SELECTORS.titleFr, entry.title?.french || '');
    Helper.log('Filled title.');

    // Card 0's text fields specifically don't sync otherwise (same class of
    // issue as Hub Spokes NxM's row 0 — see hub-spoke.js): for each one,
    // first CDP-focus+click the real field itself, then CDP-click a dummy
    // input appended INSIDE card 0's own dragElementWrapper (rather than at
    // the body root, like the generic blur below) to force a real blur on
    // it. No test-dataid wrapper exists for this module (card index is
    // baked directly into each field's e2eid), so the card's own drag
    // wrapper is used as the scoping container instead. Must happen before
    // module name is set.
    const firstCardContainer = HubSpokeCard.findCardWrappers()[0];
    if (firstCardContainer) {
      const firstCardSel = HubSpokeCard.SELECTORS.card(0);
      const fieldsToSync = [
        firstCardSel.headingEn,
        firstCardSel.headingFr,
        firstCardSel.image.en.altText,
        firstCardSel.image.fr.altText,
        firstCardSel.linkValueEn,
        firstCardSel.linkValueFr,
      ];
      for (const fieldSelector of fieldsToSync) {
        const fieldEl = document.querySelector(fieldSelector);
        if (fieldEl) {
          await Helper.clickTrusted(fieldEl);
          await Helper.sleep(200);
        } else {
          console.warn(`[HubSpokeCard] Card 1 field not found: ${fieldSelector}`);
        }
        await Helper.blurActiveFieldViaDummyInput(firstCardContainer);
      }
      Helper.log('Forced focus+blur on card 1 fields to sync them.');
    } else {
      console.warn('[HubSpokeCard] Card 1 container not found — skipping its extra blur.');
    }

    // Module name filled last of all — per explicit request — once every
    // card is done, rather than up front (see Helper.setModuleName's own
    // retry/verify logic for why this field needs special handling).
    await Helper.setModuleName(HubSpokeCard.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    // Click a dummy field via CDP to force a real blur on whatever was
    // last focused, before handing off for review — catches any field
    // that only commits its value on blur rather than on input/change.
    await Helper.blurActiveFieldViaDummyInput();

    Helper.log('Hub Spoke Card filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `hubSpokeCard-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(
      HubSpokeCard.SELECTORS.saveButton,
      HubSpokeCard.SELECTORS.discardButton,
      moduleRecord
    );
  };
}
