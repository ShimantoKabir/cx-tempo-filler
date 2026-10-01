// Fills the Skinny Banner module form after ModuleFinder has added and
// opened it (see manifest.json's content_scripts order — must load before
// page-id-founder.js, which calls SkinnyBanner.run() right after
// ModuleFinder.run() finishes).
//
// Selector layout differs by device type: web has separate desktop/mobile
// image slots and per-field data-e2eid names, app has a single mobile image
// slot and reuses one generic "campaigns-campaigns-0-*" field per section.
// See scratch.txt for the source mapping this was built from.

class SkinnyBanner {
  static SELECTORS = {
    web: {
      moduleName: 'input[id="../name"]',
      bannerTypeButton: 'button[data-e2eid="bannerType"]',
      bannerTypeOption: 'button[data-e2eid="bannerType"] + div div[id^="option-"]',
      bannerHeight: 'input[data-e2eid="desktopBannerHeight"]',
      bannerBgColor: 'input[data-e2eid="backgroundColor"]',
      image: {
        english: {
          desktop: {
            open: 'button[data-e2eid="bannerImage-dropdown-button"]',
            search: 'input[data-e2eid="bannerImage-dropdown-input"]',
            searchBtn: 'button[data-e2eid="bannerImage-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="bannerImage-alt-text"]',
          },
          mobile: {
            open: 'button[data-e2eid="mobileImage-dropdown-button"]',
            search: 'input[data-e2eid="mobileImage-dropdown-input"]',
            searchBtn: 'button[data-e2eid="mobileImage-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="mobileImage-alt-text"]',
          },
        },
        french: {
          desktop: {
            open: 'button[data-e2eid="fr_bannerImage-dropdown-button"]',
            search: 'input[data-e2eid="fr_bannerImage-dropdown-input"]',
            searchBtn: 'button[data-e2eid="fr_bannerImage-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="fr_bannerImage-alt-text"]',
          },
          mobile: {
            open: 'button[data-e2eid="fr_mobileImage-dropdown-button"]',
            search: 'input[data-e2eid="fr_mobileImage-dropdown-input"]',
            searchBtn: 'button[data-e2eid="fr_mobileImage-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="fr_mobileImage-alt-text"]',
          },
        },
      },
      sections: {
        heading: {
          addButton: { selector: 'div[data-e2eid="heading-left-nav-Heading details-add-button"]' },
          en: 'input[data-e2eid="heading-heading-0-title"]',
          fr: 'input[data-e2eid="heading-heading-0-fr_title"]',
          color: 'input[data-e2eid="heading-heading-0-fontColor"]',
          maxLen: 40,
        },
        subHeading: {
          addButton: { selector: 'div[data-e2eid="subHeading-left-nav-Sub Heading details-add-button"]' },
          en: 'input[data-e2eid="subHeading-subHeading-0-title"]',
          fr: 'input[data-e2eid="subHeading-subHeading-0-fr_title"]',
          color: 'input[data-e2eid="subHeading-subHeading-0-fontColor"]',
          maxLen: 40,
        },
        cta: {
          addButton: { selector: 'div[data-e2eid="bannerCta-left-nav-Banner CTA-add-button"]' },
          enText: 'input[data-e2eid="bannerCta-bannerCta-0-ctaLink-clickable-el"]',
          enLink: 'textarea[data-e2eid="bannerCta-bannerCta-0-ctaLink-url-link"]',
          frText: 'input[data-e2eid="bannerCta-bannerCta-0-fr_ctaLink-clickable-el"]',
          frLink: 'textarea[data-e2eid="bannerCta-bannerCta-0-fr_ctaLink-url-link"]',
          color: 'input[data-e2eid="bannerCta-bannerCta-0-textColor"]',
        },
      },
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: true },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: true },
    },
    app: {
      moduleName: 'input[id="../name"]',
      bannerTypeButton: 'button[data-e2eid="campaigns-campaigns-0-bannerType"]',
      bannerTypeOption: 'button[data-e2eid="campaigns-campaigns-0-bannerType"] + div div[id^="option-"]',
      bannerHeight: 'input[data-e2eid="campaigns-campaigns-0-bannerHeight"]',
      bannerBgColor: 'input[id="bannerBackgroundColor"]',
      image: {
        english: {
          mobile: {
            open: 'button[data-e2eid="campaigns-campaigns-0-image-dropdown-button"]',
            search: 'input[data-e2eid="campaigns-campaigns-0-image-dropdown-input"]',
            searchBtn: 'button[data-e2eid="campaigns-campaigns-0-image-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="campaigns-campaigns-0-image-alt-text"]',
          },
        },
        french: {
          mobile: {
            open: 'button[data-e2eid="campaigns-campaigns-0-fr_image-dropdown-button"]',
            search: 'input[data-e2eid="campaigns-campaigns-0-fr_image-dropdown-input"]',
            searchBtn: 'button[data-e2eid="campaigns-campaigns-0-fr_image-search-asset-button"]',
            result: 'div#searched-image',
            altText: 'input[data-e2eid="campaigns-campaigns-0-fr_image-alt-text"]',
          },
        },
      },
      sections: {
        heading: {
          addButton: { selector: 'button.add-group-button-right', text: 'HEADING', exact: false },
          en: 'div[id="heading"] input[data-e2eid="campaigns-campaigns-0-text"]',
          fr: 'div[id="heading"] input[data-e2eid="campaigns-campaigns-0-fr_text"]',
          color: 'div[id="heading"] input[data-e2eid="campaigns-campaigns-0-textColor"]',
          maxLen: 115,
        },
        subHeading: {
          addButton: { selector: 'button.add-group-button-right', text: 'SUB-HEADING', exact: false },
          en: 'div[id="subHeading"] input[data-e2eid="campaigns-campaigns-0-text"]',
          fr: 'div[id="subHeading"] input[data-e2eid="campaigns-campaigns-0-fr_text"]',
          color: 'div[id="subHeading"] input[data-e2eid="campaigns-campaigns-0-textColor"]',
          maxLen: 100,
        },
        cta: {
          addButton: { selector: 'button.add-group-button-right', text: 'BANNER CTA', exact: false },
          enText: 'input[data-e2eid="campaigns-campaigns-0-ctaLink-clickable-el"]',
          enLink: 'textarea[data-e2eid="campaigns-campaigns-0-ctaLink-url-link"]',
          frText: 'input[data-e2eid="campaigns-campaigns-0-fr_ctaLink-clickable-el"]',
          frLink: 'textarea[data-e2eid="campaigns-campaigns-0-fr_ctaLink-url-link"]',
          color: 'div[id="bannerCta,0"] input[data-e2eid="campaigns-campaigns-0-textColor"]',
        },
      },
      // App-only — no "add" button, always visible. Required for the
      // module to be publishable on app.
      clickThroughUrl: {
        enText: 'input[data-e2eid="campaigns-campaigns-0-destination-clickable-el"]',
        enLink: 'textarea[data-e2eid="campaigns-campaigns-0-destination-url-link"]',
        frText: 'input[data-e2eid="campaigns-campaigns-0-fr_destination-clickable-el"]',
        frLink: 'textarea[data-e2eid="campaigns-campaigns-0-fr_destination-url-link"]',
      },
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
  };

  // A brief can carry either or both Skinny Banner variants; each one found
  // gets its own module added and filled in, in the brief's declared "order"
  // rather than object key order (which isn't guaranteed to match intent).
  static detectBannerTypes = (brandPage) => {
    const entries = [];
    if (brandPage.imageAndTextSkinnyBanner) {
      entries.push({ type: 'image-and-text', order: brandPage.imageAndTextSkinnyBanner.order ?? 0 });
    }
    if (brandPage.textOnlySkinnyBanner) {
      entries.push({ type: 'text-only', order: brandPage.textOnlySkinnyBanner.order ?? 0 });
    }
    entries.sort((a, b) => a.order - b.order);
    return entries.map((e) => e.type);
  };

  // Single source of truth for the bannerType <-> brief property key mapping,
  // shared by run() and by page-id-founder.js's module selection/completion
  // tracking.
  static moduleKeyForBannerType = (bannerType) =>
    bannerType === 'text-only' ? 'textOnlySkinnyBanner' : 'imageAndTextSkinnyBanner';

  // Briefs sometimes give hex colors without the leading "#" (e.g. "001E60").
  // The CMS color field expects one, so add it back rather than write an
  // invalid value.
  static normalizeColor = (color) => {
    if (!color) return color;
    return color.startsWith('#') ? color : `#${color}`;
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  // Every color field goes through here so the "#" fix-up can never be
  // forgotten at a call site. When the brief supplies a color, it's
  // normalized and written; either way, the field's resulting value (brief's
  // or whatever was already sitting in the CMS) gets validated as a
  // well-formed 7-character hex code (# + 6 digits), warning the user
  // on-page if not — otherwise a pre-existing bad value would never surface.
  static setColor = async (selector, color) => {
    const el = await Helper.waitForElement(selector);
    if (color) {
      await Helper.setInputValue(el, SkinnyBanner.normalizeColor(color));
    }

    const finalValue = el.value;
    if (finalValue && (finalValue.length !== 7 || !finalValue.startsWith('#'))) {
      const msg = `Color "${finalValue}" is not a valid 7-character hex code (e.g. #001E60) — check the brief/CMS field.`;
      console.warn(`[SkinnyBanner] ${msg}`);
      Helper.notify(msg, true);
    }
  };

  // Brief text can exceed the CMS field's max length. Setting .value directly
  // bypasses the input's native max length enforcement, so truncate ourselves
  // rather than risk a save-time validation error downstream.
  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[SkinnyBanner] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await SkinnyBanner.setValue(selector, v);
  };

  static addSection = async (sectionSel) => {
    const { addButton } = sectionSel;
    const btn = addButton.text
      ? await Helper.waitForElementByText(addButton.selector, addButton.text, addButton.exact)
      : await Helper.waitForElement(addButton.selector);
    btn.click();
    await Helper.sleep(300);
  };

  // Color alone isn't reason enough to add a heading/sub-heading/CTA section
  // — with no actual text/link, there'd be nothing meaningful for the color
  // to apply to, so these only count text/link fields as "present".
  static hasTextContent = (localeData) => {
    const { english, french } = localeData;
    return Boolean(english?.text || french?.text);
  };

  static hasCtaContent = (localeData) => {
    const { english, french } = localeData;
    return Boolean(english?.linkText || english?.linkValue || french?.linkText || french?.linkValue);
  };

  // Only one font-color control exists per heading/sub-heading block (not
  // one per language), so english.textColor is treated as the source of
  // truth; a mismatch just means the brief authored two different colors
  // for one field, which is worth flagging rather than silently picking one.
  static fillTextBlock = async (sectionSel, localeData) => {
    const { english, french } = localeData;
    await SkinnyBanner.setTruncated(sectionSel.en, english.text, sectionSel.maxLen);
    await SkinnyBanner.setTruncated(sectionSel.fr, french.text, sectionSel.maxLen);

    const color = english.textColor || french.textColor;
    if (english.textColor && french.textColor && english.textColor !== french.textColor) {
      console.warn('[SkinnyBanner] english/french textColor differ; using english value.', localeData);
    }
    await SkinnyBanner.setColor(sectionSel.color, color);
  };

  static fillCta = async (ctaSel, localeData, linkColor, deviceType, addGbo) => {
    const { english, french } = localeData;
    const linkValue = (url) => (deviceType === 'app' && addGbo ? Helper.appendGboParam(url) : url || '');

    await SkinnyBanner.setValue(ctaSel.enText, english.linkText || '');
    await SkinnyBanner.setValue(ctaSel.enLink, linkValue(english.linkValue));
    await SkinnyBanner.setValue(ctaSel.frText, french.linkText || '');
    await SkinnyBanner.setValue(ctaSel.frLink, linkValue(french.linkValue));

    // bannerCta.linkColor is a single color shared across both languages —
    // only touch the color input when the brief actually supplies one.
    await SkinnyBanner.setColor(ctaSel.color, linkColor);
  };

  static hasClickThroughContent = (localeData) => {
    const { english, french } = localeData || {};
    return Boolean(english?.linkText || english?.linkValue || french?.linkText || french?.linkValue);
  };

  // App-only, required for the module to be publishable — see scratch.txt.
  static fillClickThroughUrl = async (sel, localeData) => {
    const { english, french } = localeData;
    await SkinnyBanner.setValue(sel.enText, english.linkText || '');
    await SkinnyBanner.setValue(sel.enLink, english.linkValue || '');
    await SkinnyBanner.setValue(sel.frText, french.linkText || '');
    await SkinnyBanner.setValue(sel.frLink, french.linkValue || '');
  };

  // Split into select-only and alt-text-only (same two-stage pattern as
  // HubSpoke): confirmed via testing there that opening the image search
  // popup wipes sibling fields filled beforehand, and alt text only saves
  // once an image is actually selected — so run() selects every image
  // AFTER everything else is saved, then sets alt text right after.
  static selectImages = async (imageSel, bannerData) => {
    for (const lang of Object.keys(imageSel)) {
      const langData = bannerData[lang];
      if (!langData) continue;
      const slots = imageSel[lang];

      for (const slot of Object.keys(slots)) {
        const searchText = langData[slot];
        if (!searchText) continue;
        const cfg = slots[slot];

        const openBtn = await Helper.waitForElement(cfg.open);
        await Helper.clickTrusted(openBtn);
        await Helper.sleep(300);

        const searchInput = await Helper.waitForElement(cfg.search);
        await Helper.setInputValue(searchInput, searchText);

        const searchBtn = await Helper.waitForElement(cfg.searchBtn);
        await Helper.clickTrusted(searchBtn);

        const result = await Helper.waitForElement(cfg.result);
        await Helper.clickTrusted(result);
        Helper.log(`Selected ${lang} ${slot} image: ${searchText}`);
      }
    }
  };

  static fillImageAltTexts = async (imageSel, bannerData, altCopyContext) => {
    for (const lang of Object.keys(imageSel)) {
      const langData = bannerData[lang];
      if (!langData) continue;
      const slots = imageSel[lang];

      for (const slot of Object.keys(slots)) {
        const searchText = langData[slot];
        if (!searchText) continue;
        const altText =
          langData[`${slot}AltCopy`] || Helper.generateAltCopy({ ...altCopyContext, language: lang });
        const cfg = slots[slot];
        await SkinnyBanner.setValue(cfg.altText, altText);
      }
    }
  };

  // Errors intentionally propagate to the caller — page-id-founder.js's
  // runSkinnyBanner loop needs a failed module to stop the loop instead of
  // continuing on to fill a module that was never actually added.
  static run = async (deviceType, bannerType, brandPage, addGbo) => {
    const SEL = SkinnyBanner.SELECTORS[deviceType];
    if (!SEL) throw new Error(`No Skinny Banner selectors for device type: ${deviceType}`);

    const bannerKey = SkinnyBanner.moduleKeyForBannerType(bannerType);
    const banner = brandPage[bannerKey];
    if (!banner) throw new Error(`Brief is missing ${bannerKey} data`);

    Helper.log('Filling Skinny Banner module...');

    const moduleType = bannerType === 'text-only' ? 'text-only-skinny-banner' : 'skinny-banner';
    const moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, moduleType, deviceType);
    await SkinnyBanner.setValue(SEL.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    const typeBtn = await Helper.waitForElement(SEL.bannerTypeButton);
    typeBtn.click();
    await Helper.sleep(300);
    const optionText = bannerType === 'text-only' ? 'Skinny' : 'POV';
    const typeOption = await Helper.waitForElementByText(SEL.bannerTypeOption, optionText, false);
    typeOption.click();
    Helper.log(`Selected banner type option: ${optionText}`);
    await Helper.sleep(300);

    await SkinnyBanner.setValue(SEL.bannerHeight, banner.bannerHeight);
    Helper.log(`Set banner height: ${banner.bannerHeight}`);

    if (bannerType === 'text-only') {
      // Required for text-only banners — there's no image, so the
      // background color is the only visual fill.
      if (!banner.bannerBgColor) {
        const msg = 'bannerBgColor is required for text-only banners but missing in brief.';
        console.warn(`[SkinnyBanner] ${msg}`);
        Helper.notify(msg, true);
      }
      await SkinnyBanner.setColor(SEL.bannerBgColor, banner.bannerBgColor);
    }
    // bannerType !== 'text-only': image selection deferred to after
    // everything else is saved (see below) — the image popup interaction
    // wipes sibling fields if touched before they're saved.

    const headingData = banner.headline[deviceType];
    if (SkinnyBanner.hasTextContent(headingData)) {
      await SkinnyBanner.addSection(SEL.sections.heading);
      await SkinnyBanner.fillTextBlock(SEL.sections.heading, headingData);
      Helper.log('Filled heading.');
    } else {
      Helper.log('No heading text in brief — skipping heading section.');
    }

    if (bannerType !== 'text-only' && banner.subHeadline) {
      const subHeadingData = banner.subHeadline[deviceType];
      if (SkinnyBanner.hasTextContent(subHeadingData)) {
        await SkinnyBanner.addSection(SEL.sections.subHeading);
        await SkinnyBanner.fillTextBlock(SEL.sections.subHeading, subHeadingData);
        Helper.log('Filled sub-heading.');
      } else {
        Helper.log('No sub-heading text in brief — skipping sub-heading section.');
      }
    }

    const ctaData = banner.bannerCta[deviceType];
    if (SkinnyBanner.hasCtaContent(ctaData)) {
      await SkinnyBanner.addSection(SEL.sections.cta);
      await SkinnyBanner.fillCta(SEL.sections.cta, ctaData, banner.bannerCta.linkColor, deviceType, addGbo);
      Helper.log('Filled banner CTA.');
    } else {
      Helper.log('No banner CTA content in brief — skipping CTA section.');
    }

    // App-only, required for the module to be publishable (see scratch.txt) —
    // warn if the brief is missing it rather than silently leaving it blank.
    if (deviceType === 'app') {
      const clickThroughData = banner.bannerClickThoughURL && banner.bannerClickThoughURL.app;
      if (!SkinnyBanner.hasClickThroughContent(clickThroughData)) {
        const msg = 'bannerClickThoughURL is required for app modules to be publishable but is missing/empty in the brief.';
        console.warn(`[SkinnyBanner] ${msg}`);
        Helper.notify(msg, true);
      }
      if (clickThroughData) {
        await SkinnyBanner.fillClickThroughUrl(SEL.clickThroughUrl, clickThroughData);
        Helper.log('Filled banner click-through URL.');
      }
    }

    if (bannerType !== 'text-only') {
      // Intermediate save of everything except image/alt text — same
      // two-stage pattern as HubSpoke: auto-clicked (not handed off, since
      // there's nothing meaningful to review here yet), then re-enter Edit
      // (no-op in Create mode, where nothing locked the form), then select
      // images and fill their alt text.
      Helper.log('Non-image fields filled — saving automatically before filling images...');
      const intermediateSaveBtn = await Helper.waitForElementByText(
        SEL.saveButton.selector,
        SEL.saveButton.text,
        SEL.saveButton.exact
      );
      intermediateSaveBtn.click();
      await Helper.sleep(1500);

      await ModuleEditor.clickEditButtonIfPresent();

      const imageAltContext = { brandName: brandPage.brandName, deviceType, moduleType };
      await SkinnyBanner.selectImages(SEL.image, banner.banner[deviceType]);
      await SkinnyBanner.fillImageAltTexts(SEL.image, banner.banner[deviceType], imageAltContext);
    }

    Helper.log('Skinny Banner filled — review and click Save (or Discard Changes) to continue.');
    return await Helper.waitForSaveOrDiscard(SEL.saveButton, SEL.discardButton);
  };
}
