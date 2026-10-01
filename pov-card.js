// Fills the POV Card module form after ModuleFinder has added and opened it
// (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt: web and app use different module find keys ("POVCards"
// vs "POVCarousel") and genuinely different field sets — app has
// heading/sub-heading/eyebrow, web has heading/description/eyebrow/
// text-color plus a module-level sub-title that app doesn't have. Card
// index is baked directly into every field's data-e2eid (no shared/
// duplicate e2eid across cards like Hub Spokes' categories), so no
// test-dataid scoping wrapper is needed here.
//
// Card 0 is assumed to exist by default when the module opens (same
// assumption already used for Hero POV's card 0 / Hub Spokes' row 0) —
// scratch.txt doesn't explicitly confirm this, only that an "add pov card"
// control exists for anything beyond that.

class PovCard {
  static MAX_CARDS = 5;

  static SELECTORS = {
    app: {
      moduleName: 'input[id="../name"]',
      titleEn: 'input[data-e2eid="title"]',
      titleFr: 'input[data-e2eid="fr_title"]',
      addCardButton: 'div.add-group-button',
      card: (i) => ({
        image: {
          en: {
            open: `button[data-e2eid="POVs-POVs-${i}-POVImage-dropdown-button"]`,
            search: `input[data-e2eid="POVs-POVs-${i}-POVImage-dropdown-input"]`,
            searchBtn: `button[data-e2eid="POVs-POVs-${i}-POVImage-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="POVs-POVs-${i}-POVImage-alt-text"]`,
          },
          fr: {
            open: `button[data-e2eid="POVs-POVs-${i}-fr_POVImage-dropdown-button"]`,
            search: `input[data-e2eid="POVs-POVs-${i}-fr_POVImage-dropdown-input"]`,
            searchBtn: `button[data-e2eid="POVs-POVs-${i}-fr_POVImage-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="POVs-POVs-${i}-fr_POVImage-alt-text"]`,
          },
        },
        headingEn: `input[data-e2eid="POVs-POVs-${i}-POVHeading"]`,
        headingFr: `input[data-e2eid="POVs-POVs-${i}-fr_POVHeading"]`,
        headingMaxLen: 34,
        subHeadingEn: `input[data-e2eid="POVs-POVs-${i}-POVSubHeading"]`,
        subHeadingFr: `input[data-e2eid="POVs-POVs-${i}-fr_POVSubHeading"]`,
        subHeadingMaxLen: 85,
        // Only one eyebrow field documented for app — no fr_ variant.
        eyebrow: `input[data-e2eid="POVs-POVs-${i}-eyeBrow"]`,
        eyebrowMaxLen: 35,
        cta: {
          enText: `input[data-e2eid="POVs-POVs-${i}-POVCtaLink-clickable-el"]`,
          enLink: `textarea[data-e2eid="POVs-POVs-${i}-POVCtaLink-url-link"]`,
          frText: `input[data-e2eid="POVs-POVs-${i}-fr_POVCtaLink-clickable-el"]`,
          frLink: `textarea[data-e2eid="POVs-POVs-${i}-fr_POVCtaLink-url-link"]`,
        },
      }),
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
    web: {
      moduleName: 'input[id="../name"]',
      titleEn: 'input[data-e2eid="headingText"]',
      titleFr: 'input[data-e2eid="fr_headingText"]',
      // Module-level, no fr_ variant documented — app has no equivalent.
      subTitle: 'input[data-e2eid="subHeadingText"]',
      addCardButton: 'div.add-group-button',
      card: (i) => ({
        image: {
          en: {
            open: `button[data-e2eid="cards-cards-${i}-image-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-image-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-image-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-image-alt-text"]`,
          },
          fr: {
            open: `button[data-e2eid="cards-cards-${i}-fr_image-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-fr_image-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-fr_image-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-fr_image-alt-text"]`,
          },
        },
        headingEn: `input[data-e2eid="cards-cards-${i}-headingText"]`,
        headingFr: `input[data-e2eid="cards-cards-${i}-fr_headingText"]`,
        headingMaxLen: 24,
        descriptionEn: `input[data-e2eid="cards-cards-${i}-descriptionText"]`,
        descriptionFr: `input[data-e2eid="cards-cards-${i}-fr_descriptionText"]`,
        descriptionMaxLen: 75,
        eyebrowEn: `input[data-e2eid="cards-cards-${i}-eyeBrow"]`,
        eyebrowFr: `input[data-e2eid="cards-cards-${i}-fr_eyeBrow"]`,
        eyebrowMaxLen: 50,
        // scratch.txt literally has `input[cards-cards-0-textColor]`,
        // missing the data-e2eid= prefix used by every other selector in
        // this file — treated as a typo and corrected to the standard form.
        textColor: `input[data-e2eid="cards-cards-${i}-textColor"]`,
        cta: {
          enText: `input[data-e2eid="cards-cards-${i}-link-clickable-el"]`,
          enLink: `textarea[data-e2eid="cards-cards-${i}-link-url-link"]`,
          frText: `input[data-e2eid="cards-cards-${i}-fr_link-clickable-el"]`,
          frLink: `textarea[data-e2eid="cards-cards-${i}-fr_link-url-link"]`,
        },
      }),
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[PovCard] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await PovCard.setValue(selector, v);
  };

  static normalizeColor = (color) => {
    if (!color) return color;
    return color.startsWith('#') ? color : `#${color}`;
  };

  static setColor = async (selector, color) => {
    if (!color) return;
    const normalized = PovCard.normalizeColor(color);
    await PovCard.setValue(selector, normalized);

    if (normalized.length !== 7 || !normalized.startsWith('#')) {
      const msg = `Color "${normalized}" is not a valid 7-character hex code (e.g. #001E60) — check the brief.`;
      console.warn(`[PovCard] ${msg}`);
      Helper.notify(msg, true);
    }
  };

  static fillImage = async (cfg, data, altCopyContext) => {
    if (!data || !data.searchText) return;

    const openBtn = await Helper.waitForElement(cfg.open);
    openBtn.click();
    await Helper.sleep(300);

    const searchInput = await Helper.waitForElement(cfg.search);
    Helper.setInputValue(searchInput, data.searchText);

    const searchBtn = await Helper.waitForElement(cfg.searchBtn);
    searchBtn.click();

    const result = await Helper.waitForElement(cfg.result);
    result.click();
    Helper.log(`Selected image: ${data.searchText}`);

    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await PovCard.setValue(cfg.altText, altText);
  };

  static fillCard = async (cardSel, cardData, deviceType, brandName, addGbo) => {
    const altCopyContext = (language) => ({ brandName, deviceType, language, moduleType: 'pov-cards' });

    const imageData = cardData.image?.[deviceType];
    await PovCard.fillImage(cardSel.image.en, imageData?.english, altCopyContext('english'));
    await PovCard.fillImage(cardSel.image.fr, imageData?.french, altCopyContext('french'));

    const headingData = cardData.heading?.[deviceType];
    await PovCard.setTruncated(cardSel.headingEn, headingData?.english, cardSel.headingMaxLen);
    await PovCard.setTruncated(cardSel.headingFr, headingData?.french, cardSel.headingMaxLen);

    if (deviceType === 'app') {
      const subHeadingData = cardData.subHeading?.app;
      await PovCard.setTruncated(cardSel.subHeadingEn, subHeadingData?.english, cardSel.subHeadingMaxLen);
      await PovCard.setTruncated(cardSel.subHeadingFr, subHeadingData?.french, cardSel.subHeadingMaxLen);

      await PovCard.setTruncated(cardSel.eyebrow, cardData.eyebrow?.app, cardSel.eyebrowMaxLen);
    } else {
      const descriptionData = cardData.description?.web;
      await PovCard.setTruncated(cardSel.descriptionEn, descriptionData?.english, cardSel.descriptionMaxLen);
      await PovCard.setTruncated(cardSel.descriptionFr, descriptionData?.french, cardSel.descriptionMaxLen);

      const eyebrowData = cardData.eyebrow?.web;
      await PovCard.setTruncated(cardSel.eyebrowEn, eyebrowData?.english, cardSel.eyebrowMaxLen);
      await PovCard.setTruncated(cardSel.eyebrowFr, eyebrowData?.french, cardSel.eyebrowMaxLen);

      await PovCard.setColor(cardSel.textColor, cardData.textColor?.web);
    }

    const ctaData = cardData.cta?.[deviceType];
    if (ctaData) {
      const linkValue = (url) => (deviceType === 'app' && addGbo ? Helper.appendGboParam(url) : url || '');
      await PovCard.setValue(cardSel.cta.enText, ctaData.english?.linkText || '');
      await PovCard.setValue(cardSel.cta.enLink, linkValue(ctaData.english?.linkValue));
      await PovCard.setValue(cardSel.cta.frText, ctaData.french?.linkText || '');
      await PovCard.setValue(cardSel.cta.frLink, linkValue(ctaData.french?.linkValue));
    }
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run/HeroPov.run/HubSpoke.run — so a
  // failure stops the loop instead of continuing on to a module that was
  // never actually added.
  static run = async (deviceType, brandPage, addGbo) => {
    const SEL = PovCard.SELECTORS[deviceType];
    if (!SEL) throw new Error(`No POV Card selectors for device type: ${deviceType}`);

    const pov = brandPage.povCard;
    if (!pov) throw new Error('Brief is missing povCard data');

    const cards = Array.isArray(pov.cards) ? pov.cards.slice(0, PovCard.MAX_CARDS) : [];
    if (cards.length === 0) throw new Error('povCard.cards is empty');

    Helper.log('Filling POV Card module...');

    const moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'pov-cards', deviceType);
    await PovCard.setValue(SEL.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    const titleData = pov.title?.[deviceType];
    await PovCard.setValue(SEL.titleEn, titleData?.english || '');
    await PovCard.setValue(SEL.titleFr, titleData?.french || '');

    if (deviceType === 'web' && pov.subTitle?.web) {
      await PovCard.setValue(SEL.subTitle, pov.subTitle.web);
    }

    for (let i = 0; i < cards.length; i++) {
      if (i > 0) {
        const addBtn = await Helper.waitForElement(SEL.addCardButton);
        addBtn.click();
        await Helper.sleep(300);
      }
      await PovCard.fillCard(SEL.card(i), cards[i], deviceType, brandPage.brandName, addGbo);
      Helper.log(`Filled card ${i + 1} of ${cards.length}.`);
    }

    Helper.log('POV Card filled — review and click Save (or Discard Changes) to continue.');
    return await Helper.waitForSaveOrDiscard(SEL.saveButton, SEL.discardButton);
  };
}
