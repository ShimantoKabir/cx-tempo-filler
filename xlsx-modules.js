// Per-module XLSX sheet definitions — one entry per brandPage array key
// (two keys, imageAndTextSkinnyBanner/textOnlySkinnyBanner, share one
// sheet). Built on top of xlsx-schema.js's generic field-descriptor
// helpers (textField/boolField/etc.) — load that file first.
//
// Field paths are rooted at ONE module instance (one brandPage[key][i]),
// matching exactly the shapes each content script's run() reads (see
// hero-pov.js/hub-spoke.js/etc. SELECTORS and template.json). Max repeat
// counts mirror each module's own MAX_CARDS/MAX_ROWS/MAX_COLUMNS constant.

(function (global) {
  const utils =
    typeof module !== 'undefined' && module.exports
      ? require('./xlsx-schema.js')
      : global;
  const {
    textField,
    boolField,
    numField,
    listField,
    repeatFields,
    buildRowFromEntry,
    buildEntryFromRow,
    entriesToRows,
    rowsToEntries,
    xlsxTrimTrailingBlank,
  } = utils;

  // ---- Local helpers for field-group shapes that recur across modules ----

  const LANGS = ['english', 'french'];
  const langLabel = (lang) => (lang === 'english' ? 'EN' : 'FR');
  const colorFieldLabel = (colorKey) => {
    if (colorKey === 'textColor') return 'Color';
    if (colorKey === 'desktopTextColor') return 'Desktop Color';
    if (colorKey === 'mobileTextColor') return 'Mobile Color';
    return colorKey;
  };

  // { [device]: { english: {text, ...colorKeys}, french: {...} } } for each
  // device in deviceColorKeys, or (no device split) when deviceColorKeys
  // has a '' key.
  function localizedTextBlock(label, path, deviceColorKeys) {
    const fields = [];
    Object.keys(deviceColorKeys).forEach((device) => {
      const colorKeys = deviceColorKeys[device];
      LANGS.forEach((lang) => {
        const base = device ? `${path}.${device}.${lang}` : `${path}.${lang}`;
        const devLabel = device ? `${device.toUpperCase()} ` : '';
        fields.push(textField(`${label} ${devLabel}${langLabel(lang)} Text`, `${base}.text`));
        colorKeys.forEach((colorKey) => {
          fields.push(textField(`${label} ${devLabel}${langLabel(lang)} ${colorFieldLabel(colorKey)}`, `${base}.${colorKey}`));
        });
      });
    });
    return fields;
  }

  // { [device]: { english: {linkText, linkValue}, french: {...} } }
  function localizedLinkBlock(label, path, devices) {
    const fields = [];
    devices.forEach((device) => {
      LANGS.forEach((lang) => {
        const base = device ? `${path}.${device}.${lang}` : `${path}.${lang}`;
        const devLabel = device ? `${device.toUpperCase()} ` : '';
        fields.push(textField(`${label} ${devLabel}${langLabel(lang)} Text`, `${base}.linkText`));
        fields.push(textField(`${label} ${devLabel}${langLabel(lang)} URL`, `${base}.linkValue`));
      });
    });
    return fields;
  }

  // { [device]: { english: {searchText, altCopy}, french: {...} } }
  function localizedImageBlock(label, path, devices) {
    const fields = [];
    devices.forEach((device) => {
      LANGS.forEach((lang) => {
        const base = device ? `${path}.${device}.${lang}` : `${path}.${lang}`;
        const devLabel = device ? `${device.toUpperCase()} ` : '';
        fields.push(textField(`${label} ${devLabel}${langLabel(lang)} Image`, `${base}.searchText`));
        fields.push(textField(`${label} ${devLabel}${langLabel(lang)} Alt`, `${base}.altCopy`));
      });
    });
    return fields;
  }

  // Plain { english, french } text pair (no device split) — recipe's
  // title/subhead/prepTime/etc., hubSpokeCard/hubSpokeNM's heading/name.
  function localizedPlainText(label, path) {
    return LANGS.map((lang) => textField(`${label} ${langLabel(lang)}`, `${path}.${lang}`));
  }

  function localizedList(label, path) {
    return LANGS.map((lang) => listField(`${label} ${langLabel(lang)}`, `${path}.${lang}`));
  }

  // =========================================================================
  // Skinny Banner — two brandPage keys (imageAndTextSkinnyBanner,
  // textOnlySkinnyBanner) share one sheet, distinguished by the Banner Type
  // column. bannerClickThoughURL (app-only) is identical in shape on both
  // variants per template.json.
  // =========================================================================
  const skinnyBannerFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    textField('Banner Type (image-and-text or text-only)', 'bannerType'),
    textField('Banner Height', 'bannerHeight'),
    textField('Background Color (text-only only)', 'bannerBgColor'),
    textField('Banner Image Web EN Desktop', 'banner.web.english.desktop'),
    textField('Banner Image Web EN Desktop Alt', 'banner.web.english.desktopAltCopy'),
    textField('Banner Image Web EN Mobile', 'banner.web.english.mobile'),
    textField('Banner Image Web EN Mobile Alt', 'banner.web.english.mobileAltCopy'),
    textField('Banner Image Web FR Desktop', 'banner.web.french.desktop'),
    textField('Banner Image Web FR Desktop Alt', 'banner.web.french.desktopAltCopy'),
    textField('Banner Image Web FR Mobile', 'banner.web.french.mobile'),
    textField('Banner Image Web FR Mobile Alt', 'banner.web.french.mobileAltCopy'),
    textField('Banner Image App EN Mobile', 'banner.app.english.mobile'),
    textField('Banner Image App EN Mobile Alt', 'banner.app.english.mobileAltCopy'),
    textField('Banner Image App FR Mobile', 'banner.app.french.mobile'),
    textField('Banner Image App FR Mobile Alt', 'banner.app.french.mobileAltCopy'),
    ...localizedTextBlock('Headline', 'headline', { web: ['textColor'], app: ['textColor'] }),
    ...localizedTextBlock('Sub-Headline (image-and-text only)', 'subHeadline', { web: ['textColor'], app: ['textColor'] }),
    textField('Banner CTA Link Color', 'bannerCta.linkColor'),
    ...localizedLinkBlock('Banner CTA', 'bannerCta', ['web', 'app']),
    ...localizedLinkBlock('Click-Through URL (app only)', 'bannerClickThoughURL', ['app']),
  ];

  const SkinnyBannerModule = {
    sheetName: 'Skinny Banner',
    // Exposed for column-header ordering (generator script) even though
    // this module uses custom toRows/fromRows instead of the generic
    // single-briefKey helpers — every other module's .fields serves the
    // same purpose.
    fields: skinnyBannerFields,
    toRows(brandPage) {
      const imgText = Array.isArray(brandPage.imageAndTextSkinnyBanner) ? brandPage.imageAndTextSkinnyBanner : [];
      const textOnly = Array.isArray(brandPage.textOnlySkinnyBanner) ? brandPage.textOnlySkinnyBanner : [];
      return [...imgText, ...textOnly].map((entry) => buildRowFromEntry(skinnyBannerFields, entry));
    },
    fromRows(rows) {
      const imageAndTextSkinnyBanner = [];
      const textOnlySkinnyBanner = [];
      rows.forEach((row) => {
        const entry = buildEntryFromRow(skinnyBannerFields, row);
        if (entry.bannerType === 'text-only') {
          delete entry.banner;
          delete entry.subHeadline;
          textOnlySkinnyBanner.push(entry);
        } else {
          delete entry.bannerBgColor;
          imageAndTextSkinnyBanner.push(entry);
        }
      });
      return { imageAndTextSkinnyBanner, textOnlySkinnyBanner };
    },
  };

  // =========================================================================
  // Hero POV — brandPage.heroPov[i].cards[0..MAX_CARDS-1] (hero-pov.js
  // MAX_CARDS = 5). Per card: povStyle, backgroundColor, image (8 slots),
  // logo, legal, headline, subHeadline, eyebrow, cta.
  // =========================================================================
  const HERO_POV_MAX_CARDS = 5;
  function heroPovCardFields(i) {
    const p = `cards.${i}`;
    const label = (s) => `Card ${i + 1} ${s}`;
    return [
      textField(label('POV Style'), `${p}.povStyle`),
      textField(label('Background Color Web'), `${p}.backgroundColor.web`),
      textField(label('Background Color App'), `${p}.backgroundColor.app`),
      textField(label('Image Web EN Mobile'), `${p}.image.web.english.mobile`),
      textField(label('Image Web EN Mobile Alt'), `${p}.image.web.english.mobileAltCopy`),
      textField(label('Image Web EN Desktop'), `${p}.image.web.english.desktop`),
      textField(label('Image Web EN Desktop Alt'), `${p}.image.web.english.desktopAltCopy`),
      textField(label('Image Web FR Mobile'), `${p}.image.web.french.mobile`),
      textField(label('Image Web FR Mobile Alt'), `${p}.image.web.french.mobileAltCopy`),
      textField(label('Image Web FR Desktop'), `${p}.image.web.french.desktop`),
      textField(label('Image Web FR Desktop Alt'), `${p}.image.web.french.desktopAltCopy`),
      textField(label('Image App EN Mobile'), `${p}.image.app.english.mobile`),
      textField(label('Image App EN Mobile Alt'), `${p}.image.app.english.mobileAltCopy`),
      textField(label('Image App EN Tablet'), `${p}.image.app.english.tablet`),
      textField(label('Image App EN Tablet Alt'), `${p}.image.app.english.tabletAltCopy`),
      textField(label('Image App FR Mobile'), `${p}.image.app.french.mobile`),
      textField(label('Image App FR Mobile Alt'), `${p}.image.app.french.mobileAltCopy`),
      textField(label('Image App FR Tablet'), `${p}.image.app.french.tablet`),
      textField(label('Image App FR Tablet Alt'), `${p}.image.app.french.tabletAltCopy`),
      ...localizedImageBlock(label('Logo'), `${p}.logo`, ['web', 'app']),
      textField(label('Legal Web EN Discloser'), `${p}.legal.web.english.discloser`),
      textField(label('Legal Web EN Title'), `${p}.legal.web.english.title`),
      textField(label('Legal Web EN Description'), `${p}.legal.web.english.description`),
      textField(label('Legal Web EN Desktop Color'), `${p}.legal.web.english.desktopTextColor`),
      textField(label('Legal Web EN Mobile Color'), `${p}.legal.web.english.mobileTextColor`),
      textField(label('Legal Web FR Discloser'), `${p}.legal.web.french.discloser`),
      textField(label('Legal Web FR Title'), `${p}.legal.web.french.title`),
      textField(label('Legal Web FR Description'), `${p}.legal.web.french.description`),
      textField(label('Legal Web FR Desktop Color'), `${p}.legal.web.french.desktopTextColor`),
      textField(label('Legal Web FR Mobile Color'), `${p}.legal.web.french.mobileTextColor`),
      textField(label('Legal App EN Discloser'), `${p}.legal.app.english.discloser`),
      textField(label('Legal App EN Title'), `${p}.legal.app.english.title`),
      textField(label('Legal App EN Description'), `${p}.legal.app.english.description`),
      textField(label('Legal App EN Color'), `${p}.legal.app.english.textColor`),
      textField(label('Legal App FR Discloser'), `${p}.legal.app.french.discloser`),
      textField(label('Legal App FR Title'), `${p}.legal.app.french.title`),
      textField(label('Legal App FR Description'), `${p}.legal.app.french.description`),
      textField(label('Legal App FR Color'), `${p}.legal.app.french.textColor`),
      ...localizedTextBlock(label('Headline'), `${p}.headline`, {
        web: ['desktopTextColor', 'mobileTextColor'],
        app: ['textColor'],
      }),
      ...localizedTextBlock(label('Sub-Headline'), `${p}.subHeadline`, {
        web: ['desktopTextColor', 'mobileTextColor'],
        app: ['textColor'],
      }),
      ...localizedTextBlock(label('Eyebrow'), `${p}.eyebrow`, {
        web: ['desktopTextColor', 'mobileTextColor'],
        app: ['textColor'],
      }),
      ...localizedLinkBlock(label('CTA (card-with-single-cta only)'), `${p}.cta`, ['web', 'app']),
    ];
  }
  const heroPovFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    ...repeatFields(HERO_POV_MAX_CARDS, heroPovCardFields),
  ];

  const HeroPovModule = {
    sheetName: 'Hero POV',
    briefKey: 'heroPov',
    fields: heroPovFields,
    postProcess(entry) {
      entry.cards = xlsxTrimTrailingBlank(entry.cards || []);
      return entry;
    },
  };

  // =========================================================================
  // Hub Spokes NxM — brandPage.hubSpokeNM[i].rows[0..MAX_ROWS-1]
  // .categories[0..MAX_COLUMNS-1] (hub-spoke.js MAX_ROWS=5, MAX_COLUMNS=6).
  // Deliberately wide (one row per module instance, per explicit choice) —
  // most Row/Col columns stay blank unless that many rows/categories exist.
  // =========================================================================
  const HUB_SPOKES_MAX_ROWS = 5;
  const HUB_SPOKES_MAX_COLS = 6;
  function hubSpokeCategoryFields(r, c) {
    const p = `rows.${r}.categories.${c}`;
    const label = (s) => `Row ${r + 1} Col ${c + 1} ${s}`;
    return [
      ...localizedPlainText(label('Name'), `${p}.name`),
      textField(label('Image EN'), `${p}.image.english.searchText`),
      textField(label('Link URL EN'), `${p}.image.english.linkValue`),
      textField(label('Alt EN'), `${p}.image.english.altCopy`),
      textField(label('Image FR'), `${p}.image.french.searchText`),
      textField(label('Link URL FR'), `${p}.image.french.linkValue`),
      textField(label('Alt FR'), `${p}.image.french.altCopy`),
    ];
  }
  const hubSpokesFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    numField('Columns (4 or 6)', 'columns'),
    ...localizedPlainText('Heading', 'heading'),
    ...repeatFields(HUB_SPOKES_MAX_ROWS, (r) => repeatFields(HUB_SPOKES_MAX_COLS, (c) => hubSpokeCategoryFields(r, c))),
  ];

  const HubSpokesModule = {
    sheetName: 'Hub Spokes NxM',
    briefKey: 'hubSpokeNM',
    fields: hubSpokesFields,
    postProcess(entry) {
      const rows = Array.isArray(entry.rows) ? entry.rows : [];
      rows.forEach((row) => {
        row.categories = xlsxTrimTrailingBlank(row.categories || []);
      });
      entry.rows = xlsxTrimTrailingBlank(
        rows.map((row) => (row.categories.length === 0 ? {} : row))
      );
      return entry;
    },
  };

  // =========================================================================
  // POV Card — brandPage.povCard[i].cards[0..MAX_CARDS-1] (pov-card.js
  // MAX_CARDS=5). Web and app have genuinely different field sets
  // (description vs sub-heading, text-color is web-only) — both kept as
  // separate columns, whichever the run isn't using just stays blank.
  // =========================================================================
  const POV_CARD_MAX_CARDS = 5;
  function povCardFields(i) {
    const p = `cards.${i}`;
    const label = (s) => `Card ${i + 1} ${s}`;
    return [
      ...localizedImageBlock(label('Image'), `${p}.image`, ['web', 'app']),
      ...localizedPlainText(label('Heading Web'), `${p}.heading.web`),
      ...localizedPlainText(label('Heading App'), `${p}.heading.app`),
      ...localizedPlainText(label('Sub-Heading (app only)'), `${p}.subHeading.app`),
      ...localizedPlainText(label('Description (web only)'), `${p}.description.web`),
      ...localizedPlainText(label('Eyebrow Web'), `${p}.eyebrow.web`),
      textField(label('Eyebrow App'), `${p}.eyebrow.app`),
      textField(label('Text Color (web only)'), `${p}.textColor.web`),
      ...localizedLinkBlock(label('CTA'), `${p}.cta`, ['web', 'app']),
    ];
  }
  const povCardFieldsAll = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    ...localizedPlainText('Title Web', 'title.web'),
    ...localizedPlainText('Title App', 'title.app'),
    textField('Sub-Title (web only)', 'subTitle.web'),
    ...repeatFields(POV_CARD_MAX_CARDS, povCardFields),
  ];

  const PovCardModule = {
    sheetName: 'POV Card',
    briefKey: 'povCard',
    fields: povCardFieldsAll,
    postProcess(entry) {
      entry.cards = xlsxTrimTrailingBlank(entry.cards || []);
      return entry;
    },
  };

  // =========================================================================
  // Hub Spoke Card — brandPage.hubSpokeCard[i].cards[0..MAX_CARDS-1]
  // (hub-spoke-card.js MAX_CARDS=6). App-only module.
  // =========================================================================
  const HUB_SPOKE_CARD_MAX_CARDS = 6;
  function hubSpokeCardFields(i) {
    const p = `cards.${i}`;
    const label = (s) => `Card ${i + 1} ${s}`;
    return [
      ...localizedImageBlock(label('Image'), `${p}.image`, ['']),
      ...localizedPlainText(label('Heading'), `${p}.heading`),
      ...localizedPlainText(label('Link URL'), `${p}.linkValue`),
    ];
  }
  const hubSpokeCardFieldsAll = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    ...localizedPlainText('Title', 'title'),
    ...repeatFields(HUB_SPOKE_CARD_MAX_CARDS, hubSpokeCardFields),
  ];

  const HubSpokeCardModule = {
    sheetName: 'Hub Spoke Card',
    briefKey: 'hubSpokeCard',
    fields: hubSpokeCardFieldsAll,
    postProcess(entry) {
      entry.cards = xlsxTrimTrailingBlank(entry.cards || []);
      return entry;
    },
  };

  // =========================================================================
  // Item Carousel — no repeating cards, just title/sub-title/skus.
  // =========================================================================
  const itemCarouselFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    boolField('Need Edit App', 'needEditForApp'),
    ...localizedPlainText('Title', 'title'),
    ...localizedPlainText('Sub-Title', 'subTitle'),
    listField('SKUs (one per line)', 'skus'),
  ];

  const ItemCarouselModule = {
    sheetName: 'Item Carousel',
    briefKey: 'itemCarousel',
    fields: itemCarouselFields,
  };

  // =========================================================================
  // YouTube — just the two video IDs. Web-only (Custom HTML module).
  // =========================================================================
  const youtubeFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    textField('English Video ID', 'englishId'),
    textField('French Video ID', 'frenchId'),
  ];

  const YoutubeModule = {
    sheetName: 'YouTube',
    briefKey: 'youtube',
    fields: youtubeFields,
  };

  // =========================================================================
  // Recipe — Custom HTML module, web-only. image must be a full URL (see
  // popup.js's BRIEF_VALIDATORS), not a CMS search term.
  // =========================================================================
  const recipeFields = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    ...localizedPlainText('Image URL', 'image'),
    ...localizedPlainText('Image Alt', 'alt'),
    ...localizedPlainText('Title', 'title'),
    ...localizedPlainText('Subhead', 'subhead'),
    ...localizedPlainText('Prep Time', 'prepTime'),
    ...localizedPlainText('Cook Time', 'cookTime'),
    ...localizedPlainText('Serving Size', 'servingSize'),
    ...localizedPlainText('Ingredients Label', 'ingredientsLabel'),
    ...localizedList('Ingredients (one per line)', 'ingredients'),
    ...localizedPlainText('Directions Label', 'directionsLabel'),
    ...localizedList('Directions (one per line)', 'directions'),
  ];

  const RecipeModule = {
    sheetName: 'Recipe',
    briefKey: 'recipe',
    fields: recipeFields,
  };

  // =========================================================================
  // Inspiration Module — brandPage.inspirationModule[i].cards[0..MAX_CARDS-1]
  // (inspiration-module.js MAX_CARDS=3). Web-only. Module-level title, each
  // card has an image, heading/sub-heading, a link value (URL), and a SKU
  // list.
  // =========================================================================
  const INSPIRATION_MODULE_MAX_CARDS = 3;
  function inspirationCardFields(i) {
    const p = `cards.${i}`;
    const label = (s) => `Card ${i + 1} ${s}`;
    return [
      ...localizedImageBlock(label('Image'), `${p}.cardImage`, ['']),
      ...localizedPlainText(label('Heading'), `${p}.heading`),
      ...localizedPlainText(label('Sub-Heading'), `${p}.subHeading`),
      ...localizedPlainText(label('Link URL'), `${p}.linkValue`),
      listField(label('SKUs (one per line)'), `${p}.skus`),
    ];
  }
  const inspirationModuleFieldsAll = [
    numField('Order', 'order'),
    boolField('Need Edit Web', 'needEditForWeb'),
    ...localizedPlainText('Title', 'title'),
    ...repeatFields(INSPIRATION_MODULE_MAX_CARDS, inspirationCardFields),
  ];

  const InspirationModuleModule = {
    sheetName: 'Inspiration Module',
    briefKey: 'inspirationModule',
    fields: inspirationModuleFieldsAll,
    postProcess(entry) {
      entry.cards = xlsxTrimTrailingBlank(entry.cards || []);
      return entry;
    },
  };

  // =========================================================================
  const XLSX_MODULES = [
    SkinnyBannerModule,
    HeroPovModule,
    HubSpokesModule,
    PovCardModule,
    HubSpokeCardModule,
    ItemCarouselModule,
    YoutubeModule,
    RecipeModule,
    InspirationModuleModule,
  ];

  // Shared entry point: brandPage -> { sheetName: rows[] } for every
  // module, used by both the Node generator script and popup.js's export
  // (if ever added) — and the reverse, rows-by-sheet -> brandPage.
  function brandPageToSheets(brandPage) {
    const sheets = {};
    XLSX_MODULES.forEach((mod) => {
      sheets[mod.sheetName] = mod.toRows ? mod.toRows(brandPage) : entriesToRows(mod, brandPage);
    });
    return sheets;
  }

  function sheetsToBrandPage(sheetsByName, pageId, brandName) {
    const brandPage = { pageId: pageId || '', brandName: brandName || '' };
    XLSX_MODULES.forEach((mod) => {
      const rows = sheetsByName[mod.sheetName] || [];
      if (mod.fromRows) {
        const result = mod.fromRows(rows);
        Object.entries(result).forEach(([key, list]) => {
          // Omit entirely rather than set an empty array — matches how a
          // hand-authored JSON brief looks when a module isn't used at all
          // (key absent), and is functionally identical either way
          // (Array.isArray(undefined) is false, same as .length === 0
          // downstream).
          if (Array.isArray(list) && list.length > 0) brandPage[key] = list;
        });
      } else {
        const entries = rowsToEntries(mod, rows);
        if (entries.length > 0) brandPage[mod.briefKey] = entries;
      }
    });
    return brandPage;
  }

  const XLSX_MODULES_EXPORT = { XLSX_MODULES, brandPageToSheets, sheetsToBrandPage };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XLSX_MODULES_EXPORT;
  } else {
    Object.assign(typeof window !== 'undefined' ? window : globalThis, XLSX_MODULES_EXPORT);
  }
})(typeof window !== 'undefined' ? window : globalThis);
