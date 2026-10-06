// Fills the Hero POV module form after ModuleFinder has added and opened it
// (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt's "note for hero pov": a Hero POV module holds up to 5
// "cards", each addressed by a 0-based index baked into its selectors
// (cards-cards-{i}-...). brandPage.heroPov is an array in the brief, one
// entry per card, and the array's length is how many cards get built.
// Card 0 exists by default when the module opens; each subsequent card is
// created via ADD_CARD_SELECTOR before it can be filled.

class HeroPov {
  static MAX_CARDS = 5;

  // Same selector for both device types.
  static ADD_CARD_SELECTOR = 'div[data-e2eid="cards-left-nav-Cards-add-button"]';

  static POV_STYLE_OPTION_TEXT = {
    'card-with-single-cta': 'Card with single CTA button',
    'card-with-no-cta': 'Card with no CTA',
  };

  // Edit mode only (see module-editor.js): an existing module may already
  // have cards with real data, which run()'s "card 0 already exists, empty"
  // assumption doesn't account for. Same generic "delete repeatable group"
  // component HubSpokeCard uses for its cards (dragElementWrapper +
  // deleteGroupButton + confirmDeleteGroupButton), confirmed via console —
  // no label/field filter needed, same as HubSpokeCard, since the top-level
  // "Cards" list is what this targets.
  static CARD_DELETE_SELECTORS = {
    wrapper: 'div.dragElementWrapper',
    deleteIcon: 'svg.deleteGroupButton',
    confirmButton: 'button.confirmDeleteGroupButton',
  };

  static findCardWrappers = () => [...document.querySelectorAll(HeroPov.CARD_DELETE_SELECTORS.wrapper)];

  static deleteExistingCards = async () => {
    // Count up front (same pattern as HubSpokeCard.deleteExistingCards) and
    // loop exactly that many times, rather than an arbitrary safety cap —
    // gives a real expected count to log progress against and to break
    // early on if fewer cards delete successfully than were actually found.
    const count = HeroPov.findCardWrappers().length;
    Helper.log(`Found ${count} existing card(s) to delete.`);

    for (let i = 0; i < count; i++) {
      const cards = HeroPov.findCardWrappers();
      if (cards.length === 0) break;

      const card = cards[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        card.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = card.querySelector(HeroPov.CARD_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing card ${i + 1} of ${count}: ${card.textContent}`);
      // deleteBtn is an <svg> — unlike HTMLElement, SVGElement has no
      // .click() method, so a real click must be dispatched instead.
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const confirmBtn = await Helper.waitForElement(HeroPov.CARD_DELETE_SELECTORS.confirmButton);
      confirmBtn.click();
      await Helper.sleep(500);
    }
  };

  static SELECTORS = {
    app: {
      moduleName: 'input[id="../name"]',
      card: (i) => ({
        povStyleButton: `button[data-e2eid="cards-cards-${i}-povStyle"]`,
        povStyleOption: `button[data-e2eid="cards-cards-${i}-povStyle"] + div div[id^="option-"]`,
        backgroundColor: `input[data-e2eid="cards-cards-${i}-backgroundColor"]`,
        heading: {
          en: `input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `input[data-e2eid="cards-cards-${i}-fr_text"]`,
          color: `input[data-e2eid="cards-cards-${i}-textColor"]`,
          maxLen: 29,
        },
        subHeading: {
          addButton: { selector: 'button.add-group-button-right', text: 'SUBHEADING', exact: false },
          en: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-fr_text"]`,
          color: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          maxLen: 70,
        },
        eyebrow: {
          addButton: { selector: 'button.add-group-button-right', text: 'EYEBROW', exact: false },
          en: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-fr_text"]`,
          color: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          maxLen: 30,
        },
        logo: {
          en: {
            open: `button[data-e2eid="cards-cards-${i}-logo-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-logo-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-logo-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-logo-alt-text"]`,
          },
          fr: {
            open: `button[data-e2eid="cards-cards-${i}-fr_logo-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-fr_logo-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-fr_logo-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-fr_logo-alt-text"]`,
          },
        },
        legal: {
          addButton: { selector: 'button.add-group-button-right', text: 'LEGAL DISCLOSURE', exact: false },
          en: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-regularText"]`,
          fr: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_regularText"]`,
          color: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          enTitle: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-legalBottomSheetTitle"]`,
          frTitle: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_legalBottomSheetTitle"]`,
          enDescription: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-legalBottomSheetDescription"]`,
          frDescription: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_legalBottomSheetDescription"]`,
          maxLen: { text: 21, title: 28, description: 1000 },
        },
        cta: {
          enText: `input[data-e2eid="cards-cards-${i}-button-clickable-el"]`,
          enLink: `textarea[data-e2eid="cards-cards-${i}-button-url-link"]`,
          frText: `input[data-e2eid="cards-cards-${i}-fr_button-clickable-el"]`,
          frLink: `textarea[data-e2eid="cards-cards-${i}-fr_button-url-link"]`,
        },
        // scratch.txt's own inline labels confirm the mapping: regularImage
        // is commented "mobile", largeImage is commented "tablet".
        images: {
          en: {
            mobile: {
              open: `button[data-e2eid="cards-cards-${i}-regularImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-regularImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-regularImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-regularImage-alt-text"]`,
            },
            tablet: {
              open: `button[data-e2eid="cards-cards-${i}-largeImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-largeImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-largeImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-largeImage-alt-text"]`,
            },
          },
          // App fr images sit behind their own "FR IMAGE" add button and
          // reuse the en field names. Only "open" and "altText" are actually
          // nested inside the fr_image test-dataid container — the search
          // input/button/result render in a shared popup outside it (same
          // reason `result` below was never scoped), so scoping those times
          // out waiting for elements that never appear at that path.
          fr: {
            addButton: { selector: 'button.add-group-button-right', text: 'FR IMAGE', exact: false },
            mobile: {
              open: `div[test-dataid="cards-${i},fr_image"] button[data-e2eid="cards-cards-${i}-regularImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-regularImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-regularImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `div[test-dataid="cards-${i},fr_image"] input[data-e2eid="cards-cards-${i}-regularImage-alt-text"]`,
            },
            tablet: {
              open: `div[test-dataid="cards-${i},fr_image"] button[data-e2eid="cards-cards-${i}-largeImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-largeImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-largeImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `div[test-dataid="cards-${i},fr_image"] input[data-e2eid="cards-cards-${i}-largeImage-alt-text"]`,
            },
          },
        },
      }),
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
    web: {
      moduleName: 'input[id="../name"]',
      card: (i) => ({
        povStyleButton: `button[data-e2eid="cards-cards-${i}-povStyle"]`,
        povStyleOption: `button[data-e2eid="cards-cards-${i}-povStyle"] + div div[id^="option-"]`,
        backgroundColor: `input[data-e2eid="cards-cards-${i}-backgroundColor"]`,
        heading: {
          en: `input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `input[data-e2eid="cards-cards-${i}-fr_text"]`,
          colorDesktop: `input[data-e2eid="cards-cards-${i}-textColor"]`,
          colorMobile: `input[data-e2eid="cards-cards-${i}-textColorMobile"]`,
          maxLen: 50,
        },
        subHeading: {
          addButton: { selector: 'button.add-group-button-right', text: 'SUBHEADING', exact: false },
          en: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-fr_text"]`,
          colorDesktop: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          colorMobile: `div[test-dataid="cards-${i},subheading"] input[data-e2eid="cards-cards-${i}-textColorMobile"]`,
          maxLen: 70,
        },
        eyebrow: {
          addButton: { selector: 'button.add-group-button-right', text: 'EYEBROW', exact: false },
          en: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-text"]`,
          fr: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-fr_text"]`,
          colorDesktop: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          colorMobile: `div[test-dataid="cards-${i},eyebrow"] input[data-e2eid="cards-cards-${i}-textColorMobile"]`,
          maxLen: 30,
        },
        logo: {
          en: {
            open: `button[data-e2eid="cards-cards-${i}-logo-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-logo-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-logo-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-logo-alt-text"]`,
          },
          fr: {
            open: `button[data-e2eid="cards-cards-${i}-fr_logo-dropdown-button"]`,
            search: `input[data-e2eid="cards-cards-${i}-fr_logo-dropdown-input"]`,
            searchBtn: `button[data-e2eid="cards-cards-${i}-fr_logo-search-asset-button"]`,
            result: 'div#searched-image',
            altText: `input[data-e2eid="cards-cards-${i}-fr_logo-alt-text"]`,
          },
        },
        legal: {
          addButton: { selector: 'button.add-group-button-right', text: 'DISCLOSURE', exact: false },
          en: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-regularText"]`,
          fr: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_regularText"]`,
          colorDesktop: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-textColor"]`,
          colorMobile: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-textColorMobile"]`,
          enTitle: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-legalBottomSheetTitle"]`,
          frTitle: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_legalBottomSheetTitle"]`,
          enDescription: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-legalBottomSheetDescription"]`,
          frDescription: `div[test-dataid="cards-${i},legalDisclosure"] input[data-e2eid="cards-cards-${i}-fr_legalBottomSheetDescription"]`,
          maxLen: { text: 21, title: 28, description: 1000 },
        },
        cta: {
          enText: `input[data-e2eid="cards-cards-${i}-button-clickable-el"]`,
          enLink: `textarea[data-e2eid="cards-cards-${i}-button-url-link"]`,
          frText: `input[data-e2eid="cards-cards-${i}-fr_button-clickable-el"]`,
          frLink: `textarea[data-e2eid="cards-cards-${i}-fr_button-url-link"]`,
        },
        images: {
          en: {
            mobile: {
              open: `button[data-e2eid="cards-cards-${i}-mobileImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-mobileImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-mobileImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-mobileImage-alt-text"]`,
            },
            desktop: {
              open: `button[data-e2eid="cards-cards-${i}-desktopImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-desktopImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-desktopImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-desktopImage-alt-text"]`,
            },
          },
          fr: {
            mobile: {
              open: `button[data-e2eid="cards-cards-${i}-fr_mobileImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-fr_mobileImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-fr_mobileImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-fr_mobileImage-alt-text"]`,
            },
            desktop: {
              open: `button[data-e2eid="cards-cards-${i}-fr_desktopImage-dropdown-button"]`,
              search: `input[data-e2eid="cards-cards-${i}-fr_desktopImage-dropdown-input"]`,
              searchBtn: `button[data-e2eid="cards-cards-${i}-fr_desktopImage-search-asset-button"]`,
              result: 'div#searched-image',
              altText: `input[data-e2eid="cards-cards-${i}-fr_desktopImage-alt-text"]`,
            },
          },
        },
      }),
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: true },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: true },
    },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[HeroPov] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await HeroPov.setValue(selector, v);
  };

  static normalizeColor = (color) => {
    if (!color) return color;
    return color.startsWith('#') ? color : `#${color}`;
  };

  static setColor = async (selector, color) => {
    if (!color) return;
    const normalized = HeroPov.normalizeColor(color);
    await HeroPov.setValue(selector, normalized);

    if (normalized.length !== 7 || !normalized.startsWith('#')) {
      const msg = `Color "${normalized}" is not a valid 7-character hex code (e.g. #001E60) — check the brief.`;
      console.warn(`[HeroPov] ${msg}`);
      Helper.notify(msg, true);
    }
  };

  static addSection = async (addButton) => {
    const btn = addButton.text
      ? await Helper.waitForElementByText(addButton.selector, addButton.text, addButton.exact)
      : await Helper.waitForElement(addButton.selector);
    btn.click();
    await Helper.sleep(300);
  };

  // Split select-only / alt-text-only (same two-stage pattern as HubSpoke
  // and SkinnyBanner): opening the image search popup was found to wipe
  // sibling fields filled beforehand, and alt text only saves once an
  // image is actually selected — so run() selects every image (across
  // every card) after everything else is saved, then fills alt text.
  static selectImageSlot = async (cfg, data) => {
    if (!data || !data.image) return;

    const openBtn = await Helper.waitForElement(cfg.open);
    await Helper.clickTrusted(openBtn);
    await Helper.sleep(300);

    const searchInput = await Helper.waitForElement(cfg.search);
    await Helper.setInputValue(searchInput, data.image);

    const searchBtn = await Helper.waitForElement(cfg.searchBtn);
    await Helper.clickTrusted(searchBtn);

    const result = await Helper.waitForElement(cfg.result);
    await Helper.clickTrusted(result);
    Helper.log(`Selected image: ${data.image}`);
  };

  static fillImageSlotAlt = async (cfg, data, altCopyContext) => {
    if (!data || !data.image) return;
    const altText = data.altCopy || (altCopyContext ? Helper.generateAltCopy(altCopyContext) : '');
    if (altText) {
      await HeroPov.setValue(cfg.altText, altText);
    }
  };

  // A section can say "app": "same-as-web" instead of duplicating the whole
  // web object — resolve that sentinel back to the web data for either
  // device type.
  static resolveDeviceSection = (section, deviceType) => {
    if (!section) return null;
    const data = section[deviceType];
    return data === 'same-as-web' ? section.web : data;
  };

  // image/logo data resolution shared by selectCardImages and
  // fillCardImageAlts below, so the two stages stay in sync without
  // duplicating the device-branching logic.
  static resolveCardImageSlots = (cardSel, cardData, deviceType) => {
    const altCopyContext = (language, moduleType) => ({
      brandName: cardData.__brandName,
      deviceType,
      language,
      moduleType,
    });
    const slots = [];

    const imageData = HeroPov.resolveDeviceSection(cardData.image, deviceType);
    if (imageData) {
      if (deviceType === 'app') {
        slots.push({
          cfg: cardSel.images.en.mobile,
          data: { image: imageData.english?.mobile, altCopy: imageData.english?.mobileAltCopy },
          altCopyContext: altCopyContext('english', 'hero-pov'),
        });
        slots.push({
          cfg: cardSel.images.en.tablet,
          data: { image: imageData.english?.tablet, altCopy: imageData.english?.tabletAltCopy },
          altCopyContext: altCopyContext('english', 'hero-pov'),
        });

        const hasFrImages = imageData.french?.mobile || imageData.french?.tablet;
        if (hasFrImages) {
          slots.push({ addButton: cardSel.images.fr.addButton });
          slots.push({
            cfg: cardSel.images.fr.mobile,
            data: { image: imageData.french?.mobile, altCopy: imageData.french?.mobileAltCopy },
            altCopyContext: altCopyContext('french', 'hero-pov'),
          });
          slots.push({
            cfg: cardSel.images.fr.tablet,
            data: { image: imageData.french?.tablet, altCopy: imageData.french?.tabletAltCopy },
            altCopyContext: altCopyContext('french', 'hero-pov'),
          });
        }
      } else {
        slots.push({
          cfg: cardSel.images.en.mobile,
          data: { image: imageData.english?.mobile, altCopy: imageData.english?.mobileAltCopy },
          altCopyContext: altCopyContext('english', 'hero-pov'),
        });
        slots.push({
          cfg: cardSel.images.en.desktop,
          data: { image: imageData.english?.desktop, altCopy: imageData.english?.desktopAltCopy },
          altCopyContext: altCopyContext('english', 'hero-pov'),
        });
        slots.push({
          cfg: cardSel.images.fr.mobile,
          data: { image: imageData.french?.mobile, altCopy: imageData.french?.mobileAltCopy },
          altCopyContext: altCopyContext('french', 'hero-pov'),
        });
        slots.push({
          cfg: cardSel.images.fr.desktop,
          data: { image: imageData.french?.desktop, altCopy: imageData.french?.desktopAltCopy },
          altCopyContext: altCopyContext('french', 'hero-pov'),
        });
      }
    }

    const logoData = HeroPov.resolveDeviceSection(cardData.logo, deviceType);
    if (logoData) {
      slots.push({
        cfg: cardSel.logo.en,
        data: { image: logoData.english?.searchText, altCopy: logoData.english?.altCopy },
        altCopyContext: altCopyContext('english', 'hero-pov-logo'),
      });
      slots.push({
        cfg: cardSel.logo.fr,
        data: { image: logoData.french?.searchText, altCopy: logoData.french?.altCopy },
        altCopyContext: altCopyContext('french', 'hero-pov-logo'),
      });
    }

    return slots;
  };

  static selectCardImages = async (cardSel, cardData, deviceType, brandName) => {
    const slots = HeroPov.resolveCardImageSlots(cardSel, { ...cardData, __brandName: brandName }, deviceType);
    for (const slot of slots) {
      if (slot.addButton) {
        await HeroPov.addSection(slot.addButton);
        continue;
      }
      await HeroPov.selectImageSlot(slot.cfg, slot.data);
    }
    if (slots.length > 0) Helper.log('Selected card images/logo.');
  };

  static fillCardImageAlts = async (cardSel, cardData, deviceType, brandName) => {
    const slots = HeroPov.resolveCardImageSlots(cardSel, { ...cardData, __brandName: brandName }, deviceType);
    for (const slot of slots) {
      if (slot.addButton) continue;
      await HeroPov.fillImageSlotAlt(slot.cfg, slot.data, slot.altCopyContext);
    }
    if (slots.length > 0) Helper.log('Filled card image/logo alt text.');
  };

  // Everything except image/logo — those are deferred to a later stage
  // (see run()): opening the image search popup was found to wipe sibling
  // fields filled beforehand, so every card's non-image fields get saved
  // first, then every card's images get selected and alt-texted.
  static fillCardNonImage = async (cardSel, cardData, deviceType, brandName, addGbo) => {
    // POV style — determines whether the CTA fields apply at all.
    const styleBtn = await Helper.waitForElement(cardSel.povStyleButton);
    styleBtn.click();
    await Helper.sleep(300);
    const optionText =
      HeroPov.POV_STYLE_OPTION_TEXT[cardData.povStyle] || HeroPov.POV_STYLE_OPTION_TEXT['card-with-no-cta'];
    const styleOption = await Helper.waitForElementByText(cardSel.povStyleOption, optionText, false);
    styleOption.click();
    Helper.log(`Selected POV style: ${optionText}`);
    await Helper.sleep(300);

    await HeroPov.setColor(cardSel.backgroundColor, cardData.backgroundColor?.[deviceType]);

    // Headline (required, no add button). Both device types have a color
    // control here.
    const headlineData = HeroPov.resolveDeviceSection(cardData.headline, deviceType);
    if (headlineData) {
      await HeroPov.setTruncated(cardSel.heading.en, headlineData.english?.text, cardSel.heading.maxLen);
      await HeroPov.setTruncated(cardSel.heading.fr, headlineData.french?.text, cardSel.heading.maxLen);
      if (deviceType === 'web') {
        await HeroPov.setColor(
          cardSel.heading.colorDesktop,
          headlineData.english?.desktopTextColor || headlineData.french?.desktopTextColor
        );
        await HeroPov.setColor(
          cardSel.heading.colorMobile,
          headlineData.english?.mobileTextColor || headlineData.french?.mobileTextColor
        );
      } else {
        await HeroPov.setColor(cardSel.heading.color, headlineData.english?.textColor || headlineData.french?.textColor);
      }
      Helper.log('Filled heading.');
    }

    // Sub-headline (optional, needs its own "SUBHEADING" add-button click).
    // app has a single color control here; web has separate desktop/mobile.
    const subHeadlineData = HeroPov.resolveDeviceSection(cardData.subHeadline, deviceType);
    if (subHeadlineData && (subHeadlineData.english?.text || subHeadlineData.french?.text)) {
      await HeroPov.addSection(cardSel.subHeading.addButton);
      await HeroPov.setTruncated(cardSel.subHeading.en, subHeadlineData.english?.text, cardSel.subHeading.maxLen);
      await HeroPov.setTruncated(cardSel.subHeading.fr, subHeadlineData.french?.text, cardSel.subHeading.maxLen);
      if (deviceType === 'web') {
        await HeroPov.setColor(
          cardSel.subHeading.colorDesktop,
          subHeadlineData.english?.desktopTextColor || subHeadlineData.french?.desktopTextColor
        );
        await HeroPov.setColor(
          cardSel.subHeading.colorMobile,
          subHeadlineData.english?.mobileTextColor || subHeadlineData.french?.mobileTextColor
        );
      } else {
        await HeroPov.setColor(
          cardSel.subHeading.color,
          subHeadlineData.english?.textColor || subHeadlineData.french?.textColor
        );
      }
      Helper.log('Filled sub-heading.');
    }

    // Eyebrow (optional). Same app/web color split as sub-heading.
    const eyebrowData = HeroPov.resolveDeviceSection(cardData.eyebrow, deviceType);
    if (eyebrowData && (eyebrowData.english?.text || eyebrowData.french?.text)) {
      await HeroPov.addSection(cardSel.eyebrow.addButton);
      await HeroPov.setTruncated(cardSel.eyebrow.en, eyebrowData.english?.text, cardSel.eyebrow.maxLen);
      await HeroPov.setTruncated(cardSel.eyebrow.fr, eyebrowData.french?.text, cardSel.eyebrow.maxLen);
      if (deviceType === 'web') {
        await HeroPov.setColor(
          cardSel.eyebrow.colorDesktop,
          eyebrowData.english?.desktopTextColor || eyebrowData.french?.desktopTextColor
        );
        await HeroPov.setColor(
          cardSel.eyebrow.colorMobile,
          eyebrowData.english?.mobileTextColor || eyebrowData.french?.mobileTextColor
        );
      } else {
        await HeroPov.setColor(cardSel.eyebrow.color, eyebrowData.english?.textColor || eyebrowData.french?.textColor);
      }
      Helper.log('Filled eyebrow.');
    }

    // Legal disclosure (optional). Both device types have a color control.
    const legalData = HeroPov.resolveDeviceSection(cardData.legal, deviceType);
    if (legalData && (legalData.english?.discloser || legalData.french?.discloser)) {
      await HeroPov.addSection(cardSel.legal.addButton);
      await HeroPov.setTruncated(cardSel.legal.en, legalData.english?.discloser, cardSel.legal.maxLen.text);
      await HeroPov.setTruncated(cardSel.legal.fr, legalData.french?.discloser, cardSel.legal.maxLen.text);
      await HeroPov.setTruncated(cardSel.legal.enTitle, legalData.english?.title, cardSel.legal.maxLen.title);
      await HeroPov.setTruncated(cardSel.legal.frTitle, legalData.french?.title, cardSel.legal.maxLen.title);
      await HeroPov.setTruncated(
        cardSel.legal.enDescription,
        legalData.english?.description,
        cardSel.legal.maxLen.description
      );
      await HeroPov.setTruncated(
        cardSel.legal.frDescription,
        legalData.french?.description,
        cardSel.legal.maxLen.description
      );
      if (deviceType === 'web') {
        await HeroPov.setColor(
          cardSel.legal.colorDesktop,
          legalData.english?.desktopTextColor || legalData.french?.desktopTextColor
        );
        await HeroPov.setColor(
          cardSel.legal.colorMobile,
          legalData.english?.mobileTextColor || legalData.french?.mobileTextColor
        );
      } else {
        await HeroPov.setColor(cardSel.legal.color, legalData.english?.textColor || legalData.french?.textColor);
      }
      Helper.log('Filled legal disclosure.');
    }

    // CTA — only applies when this card uses the single-CTA POV style.
    if (cardData.povStyle === 'card-with-single-cta') {
      const ctaData = HeroPov.resolveDeviceSection(cardData.cta, deviceType);
      if (ctaData) {
        const linkValue = (url) => (deviceType === 'app' && addGbo ? Helper.appendGboParam(url) : url || '');
        await HeroPov.setValue(cardSel.cta.enText, ctaData.english?.linkText || '');
        await HeroPov.setValue(cardSel.cta.enLink, linkValue(ctaData.english?.linkValue));
        await HeroPov.setValue(cardSel.cta.frText, ctaData.french?.linkText || '');
        await HeroPov.setValue(cardSel.cta.frLink, linkValue(ctaData.french?.linkValue));
        Helper.log('Filled CTA.');
      }
    }
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run — so a failure stops the loop instead
  // of continuing on to a module that was never actually added.
  // brandPage.heroPov is an array of independent module instances (same
  // "multi" pattern as itemCarousel/hubSpokeCard), each holding its own
  // "cards" array — index picks which instance, cards within it are
  // unaffected by this (still up to MAX_CARDS, card 0 pre-existing, etc).
  // cardsPreExist defaults true (a freshly-created module already has card 0
  // sitting there empty, same assumption the rest of this function makes).
  // ModuleEditor passes false after deleteExistingCards() wipes every card
  // — so card 0 needs its own "add card" click too, not just cards beyond
  // the first.
  // navigateBackAfterSave defaults true (Create mode needs to go back to
  // find the next module) — ModuleEditor passes false, since Edit mode is
  // done with exactly one module and there's nothing to go back to find.
  // Same fill order for both Create and Edit mode (confirmed working in
  // Edit mode, then carried over to Create mode too): every card's image
  // selected first (no alt text — that only saves once an image is
  // actually selected, so it's deferred to the second pass), then a
  // second pass fills everything else — non-image fields, alt text, and
  // the module name last of all.
  static run = async (
    deviceType,
    brandPage,
    index,
    addGbo,
    cardsPreExist = true,
    navigateBackAfterSave = true
  ) => {
    const SEL = HeroPov.SELECTORS[deviceType];
    if (!SEL) throw new Error(`No Hero POV selectors for device type: ${deviceType}`);

    const instance = brandPage.heroPov?.[index];
    const cards = instance?.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error(`Brief is missing heroPov[${index}].cards data`);
    }

    Helper.log('Filling Hero POV module...');

    // When the brief has more than one Hero POV, append a 1-based sequence
    // number so the generated names aren't all identical (same convention
    // as item-carousel.js/hub-spoke-card.js).
    const total = Array.isArray(brandPage.heroPov) ? brandPage.heroPov.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'hero-pov', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }

    const sortedCards = [...cards].slice(0, HeroPov.MAX_CARDS).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // No intermediate save — per explicit request, unlike every other
    // module's two-stage (non-image fields saved first, then image) split.
    // That split exists elsewhere because opening the image search popup
    // was found to wipe sibling fields filled beforehand; removing it here
    // means that risk is no longer guarded against, so verify a card's
    // text fields actually survive image selection.
    for (let i = 0; i < sortedCards.length; i++) {
      // Card 0 exists by default when the module opens; every card after
      // that needs an explicit "add card" click first.
      if (i > 0 || !cardsPreExist) {
        await HeroPov.addSection({ selector: HeroPov.ADD_CARD_SELECTOR });
      }
      await HeroPov.selectCardImages(SEL.card(i), sortedCards[i], deviceType, brandPage.brandName);
      Helper.log(`Selected images for card ${i + 1} of ${sortedCards.length} (alt text deferred).`);
    }

    for (let i = 0; i < sortedCards.length; i++) {
      await HeroPov.fillCardNonImage(SEL.card(i), sortedCards[i], deviceType, brandPage.brandName, addGbo);
      await HeroPov.fillCardImageAlts(SEL.card(i), sortedCards[i], deviceType, brandPage.brandName);
      Helper.log(`Filled remaining fields for card ${i + 1} of ${sortedCards.length}.`);
    }

    // Module name filled last of all — per explicit request — once every
    // card's image and text is done, rather than up front like every
    // other module (see setModuleName's own retry/verify logic for why
    // this field needs special handling at all).
    await Helper.setModuleName(SEL.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    // Click a dummy field via CDP to force a real blur on whatever was
    // last focused, before handing off for review — catches any field
    // that only commits its value on blur rather than on input/change.
    await Helper.blurActiveFieldViaDummyInput();

    Helper.log('Hero POV filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `heroPov-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(SEL.saveButton, SEL.discardButton, moduleRecord);
  };
}
