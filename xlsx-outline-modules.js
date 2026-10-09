// Per-module readers for the "outline" Google Sheet/XLSX format — built on
// xlsx-outline-schema.js's generic primitives, one explicit function per
// module (same philosophy as xlsx-modules.js: hand-written and reviewable,
// not inferred by reflection). Target brandPage shapes are taken from
// xlsx-modules.js's own field dot-paths (that file was already built by
// cross-referencing each content script directly) — producing those exact
// paths guarantees compatibility with hero-pov.js/hub-spoke.js/etc.
// unchanged.
//
// Every reader takes one sheet's raw rows (array of arrays, via
// XLSX.utils.sheet_to_json(ws, {header:1, defval:''})) and returns the
// brandPage array for that module key (or, for skinny-banner/hub-spoke,
// an object with multiple brandPage keys — see below).

(function (global) {
  const utils =
    typeof module !== 'undefined' && module.exports ? require('./xlsx-outline-schema.js') : global;
  const {
    splitBlocks,
    normalizeRow,
    findLabelRow,
    readScalar,
    readLangPair,
    readDeviceLangFlat,
    readDeviceLangGroup,
    readLangGroup,
    readList,
    readLangList,
  } = utils;

  // =========================================================================
  // Item Carousel — brandPage.itemCarousel[] = { title, subTitle, skus }.
  // =========================================================================
  function parseItemCarousel(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => ({
      title: readLangPair(r, 'title'),
      subTitle: readLangPair(r, 'sub-title'),
      skus: readList(r, 'skus'),
    }));
  }

  // =========================================================================
  // YouTube — brandPage.youtube[] = { englishId, frenchId }.
  // =========================================================================
  function parseYoutube(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => ({
      englishId: readScalar(r, 'english-url'),
      frenchId: readScalar(r, 'french-url'),
    }));
  }

  // =========================================================================
  // Recipe — brandPage.recipe[] = { image, alt, title, subhead, prepTime,
  // cookTime, servingSize, ingredientsLabel, ingredients, directionsLabel,
  // directions } — all {english,french} pairs; ingredients/directions are
  // {english:[...], french:[...]}.
  // =========================================================================
  function parseRecipe(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => ({
      image: readLangPair(r, 'image'),
      alt: readLangPair(r, 'alt'),
      title: readLangPair(r, 'title'),
      subhead: readLangPair(r, 'sub-head'),
      prepTime: readLangPair(r, 'prep-time'),
      cookTime: readLangPair(r, 'cook-time'),
      servingSize: readLangPair(r, 'serving-size'),
      ingredientsLabel: readLangPair(r, 'ingredients-label'),
      ingredients: readLangList(r, 'ingredients'),
      directionsLabel: readLangPair(r, 'directions-label'),
      directions: readLangList(r, 'directions'),
    }));
  }

  // =========================================================================
  // Inspiration Module — brandPage.inspirationModule[] = { title, cards }.
  // Each card: cardImage (no device split: {english:{searchText,altCopy},
  // french:{...}}), heading, subHeading, linkText, linkValue (all
  // {english,french}), skus (flat list, no lang split).
  // =========================================================================
  function parseInspirationModule(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => {
      const title = readLangPair(r, 'title');
      const cards = splitBlocks(r, 'Card').map(({ rows: cr }) => {
        const image = readLangGroup(cr, 'card-image', ['search-text', 'alt-copy']);
        return {
          cardImage: {
            english: { searchText: image.english?.['search-text'] || '', altCopy: image.english?.['alt-copy'] || '' },
            french: { searchText: image.french?.['search-text'] || '', altCopy: image.french?.['alt-copy'] || '' },
          },
          heading: readLangPair(cr, 'heading'),
          subHeading: readLangPair(cr, 'sub-headline'),
          linkText: readLangPair(cr, 'link-text'),
          linkValue: readLangPair(cr, 'link-value'),
          skus: readList(cr, 'skus'),
        };
      });
      return { title, cards };
    });
  }

  // =========================================================================
  // Accordion — brandPage.accordion[] = { title, sections }. Each section:
  // { text, details: [{ detailText }] }. Device-agnostic — the same data
  // feeds either the app "Accordion" CMS module or the web "FAQ" one (see
  // accordion.js's file header), so no device split at this layer.
  // =========================================================================
  function parseAccordion(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => {
      const title = readLangPair(r, 'title');
      const sections = splitBlocks(r, 'Section').map(({ rows: sr }) => {
        const text = readLangPair(sr, 'text');
        const details = splitBlocks(sr, 'details').map(({ rows: dr }) => ({
          detailText: readLangPair(dr, 'detail-text'),
        }));
        return { text, details };
      });
      return { title, sections };
    });
  }

  // =========================================================================
  // Skinny Banner — ONE sheet covers both brandPage keys
  // (imageAndTextSkinnyBanner, textOnlySkinnyBanner), distinguished by each
  // block's own "banner-type" field — same split-by-type convention
  // xlsx-modules.js's SkinnyBannerModule.fromRows already uses for the wide
  // format. bannerCta.linkColor and the web/app "link-value"/"link-color"
  // trailing row are read positionally (last row of the banner-cta block,
  // whatever its column D literally says) — confirmed via testing that the
  // real sheet mislabels it "link-value" in one block and "link-color" in
  // another.
  // =========================================================================
  function readBannerCta(rows) {
    const found = findLabelRow(rows, 'banner-cta');
    const result = readDeviceLangGroup(rows, 'banner-cta', ['link-text', 'link-value']);
    let linkColor = '';
    if (found) {
      for (let i = found.i + 1; i < rows.length; i++) {
        const cells = normalizeRow(rows[i]);
        if (cells[0] != null) break;
        if (cells.every((c) => c == null)) continue;
        if (cells[1] == null && cells[2] == null && cells[4] != null) {
          linkColor = cells[4];
        }
      }
    }
    return { web: result.web, app: result.app, linkColor };
  }

  function parseSkinnyBanner(rows) {
    const imageAndTextSkinnyBanner = [];
    const textOnlySkinnyBanner = [];

    splitBlocks(rows, 'id').forEach(({ rows: r }) => {
      const bannerType = readScalar(r, 'banner-type');
      const bannerHeight = readScalar(r, 'banner-height');
      const bannerBgColor = readScalar(r, 'banner-background-color');

      const bannerImages = readDeviceLangGroup(r, 'banner', [
        'mobile',
        'mobile-alt-copy',
        'desktop',
        'desktop-alt-copy',
      ]);
      const toImageShape = (deviceData) => ({
        english: {
          mobile: deviceData?.english?.mobile || '',
          mobileAltCopy: deviceData?.english?.['mobile-alt-copy'] || '',
          desktop: deviceData?.english?.desktop || '',
          desktopAltCopy: deviceData?.english?.['desktop-alt-copy'] || '',
        },
        french: {
          mobile: deviceData?.french?.mobile || '',
          mobileAltCopy: deviceData?.french?.['mobile-alt-copy'] || '',
          desktop: deviceData?.french?.desktop || '',
          desktopAltCopy: deviceData?.french?.['desktop-alt-copy'] || '',
        },
      });

      const headline = readDeviceLangGroup(r, 'headline', ['text', 'text-color']);
      const subHeadline = readDeviceLangGroup(r, 'sub-headline', ['text', 'text-color']);
      const bannerCta = readBannerCta(r);
      const clickThroughUrl = readDeviceLangGroup(r, 'banner-click-though-url', ['link-text', 'link-value']);

      const toTextColorShape = (group) => ({
        english: { text: group?.english?.text || '', textColor: group?.english?.['text-color'] || '' },
        french: { text: group?.french?.text || '', textColor: group?.french?.['text-color'] || '' },
      });
      const toLinkShape = (group) => ({
        english: { linkText: group?.english?.['link-text'] || '', linkValue: group?.english?.['link-value'] || '' },
        french: { linkText: group?.french?.['link-text'] || '', linkValue: group?.french?.['link-value'] || '' },
      });

      const entry = {
        bannerType,
        bannerHeight,
        bannerBgColor,
        banner: { web: toImageShape(bannerImages.web), app: toImageShape(bannerImages.app) },
        headline: { web: toTextColorShape(headline.web), app: toTextColorShape(headline.app) },
        subHeadline: { web: toTextColorShape(subHeadline.web), app: toTextColorShape(subHeadline.app) },
        bannerCta: {
          linkColor: bannerCta.linkColor,
          web: toLinkShape(bannerCta.web),
          app: toLinkShape(bannerCta.app),
        },
        // app-only, no further device nesting — toLinkShape already
        // produces the {english,french} shape directly from
        // clickThroughUrl.app's own {english,french} group.
        bannerClickThoughURL: { app: toLinkShape(clickThroughUrl.app) },
      };

      if (bannerType === 'text-only') {
        delete entry.banner;
        delete entry.subHeadline;
        textOnlySkinnyBanner.push(entry);
      } else {
        delete entry.bannerBgColor;
        imageAndTextSkinnyBanner.push(entry);
      }
    });

    return { imageAndTextSkinnyBanner, textOnlySkinnyBanner };
  }

  // =========================================================================
  // POV Card — brandPage.povCard[] = { title, subTitle, cards }.
  // =========================================================================
  function parsePovCard(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => {
      const title = readDeviceLangFlat(r, 'title');
      const subTitleFlat = readDeviceLangFlat(r, 'sub-title');
      const cards = splitBlocks(r, 'Card').map(({ rows: cr }) => {
        const image = readDeviceLangGroup(cr, 'image', ['search-text', 'alt-copy']);
        const toImg = (device) => ({
          english: {
            searchText: image[device]?.english?.['search-text'] || '',
            altCopy: image[device]?.english?.['alt-copy'] || '',
          },
          french: {
            searchText: image[device]?.french?.['search-text'] || '',
            altCopy: image[device]?.french?.['alt-copy'] || '',
          },
        });
        const cta = readDeviceLangGroup(cr, 'cta', ['link-text', 'link-value']);
        const toCta = (device) => ({
          english: { linkText: cta[device]?.english?.['link-text'] || '', linkValue: cta[device]?.english?.['link-value'] || '' },
          french: { linkText: cta[device]?.french?.['link-text'] || '', linkValue: cta[device]?.french?.['link-value'] || '' },
        });
        const headline = readDeviceLangFlat(cr, 'headline');
        const subHeadlineFlat = readDeviceLangFlat(cr, 'sub-headline');
        const descriptionFlat = readDeviceLangFlat(cr, 'description');
        const eyebrowFlat = readDeviceLangFlat(cr, 'eyebrow');

        return {
          image: { web: toImg('web'), app: toImg('app') },
          heading: { web: headline.web || { english: '', french: '' }, app: headline.app || { english: '', french: '' } },
          subHeading: { app: subHeadlineFlat.app || { english: '', french: '' } },
          description: { web: descriptionFlat.web || { english: '', french: '' } },
          eyebrow: {
            web: eyebrowFlat.web || { english: '', french: '' },
            app: typeof eyebrowFlat.app === 'string' ? eyebrowFlat.app : '',
          },
          textColor: { web: readScalar(cr, 'text-color') },
          cta: { web: toCta('web'), app: toCta('app') },
        };
      });
      return {
        title: { web: title.web || { english: '', french: '' }, app: title.app || { english: '', french: '' } },
        subTitle: { web: typeof subTitleFlat.web === 'object' ? subTitleFlat.web.english || '' : subTitleFlat.web || '' },
        cards,
      };
    });
  }

  // =========================================================================
  // Hub Spoke — ONE sheet ("hub-spoke") feeds BOTH brandPage.hubSpokeNM
  // (the rows/categories grid, as-is) AND brandPage.hubSpokeCard (the same
  // categories flattened into a single card list) — per explicit
  // instruction, not a type-split like Skinny Banner. hubSpokeCard caps at
  // HubSpokeCard.MAX_CARDS=6 when flattening.
  // =========================================================================
  const HUB_SPOKE_CARD_MAX_CARDS = 6;

  function readHubSpokeCategory(rows) {
    const name = readLangPair(rows, 'name');
    const image = readLangGroup(rows, 'image', ['search-text', 'alt-copy', 'link-value']);
    return {
      name,
      image: {
        english: {
          searchText: image.english?.['search-text'] || '',
          altCopy: image.english?.['alt-copy'] || '',
          linkValue: image.english?.['link-value'] || '',
        },
        french: {
          searchText: image.french?.['search-text'] || '',
          altCopy: image.french?.['alt-copy'] || '',
          linkValue: image.french?.['link-value'] || '',
        },
      },
    };
  }

  // "Row",r,"column",c is a compound single-row marker (both indices on
  // the same row) — splitBlocks only handles one label per marker row, so
  // this walks it directly rather than two nested splitBlocks calls.
  function splitHubSpokeCells(rows) {
    const cells = [];
    let current = null;
    for (const row of rows) {
      const a = row && row[0] != null ? String(row[0]).trim() : '';
      if (a === 'Row') {
        if (current) cells.push(current);
        current = { row: row[1], col: row[3], rows: [] };
      } else if (current) {
        current.rows.push(row);
      }
    }
    if (current) cells.push(current);
    return cells;
  }

  function parseHubSpoke(rows) {
    const hubSpokeNM = [];
    const hubSpokeCard = [];

    splitBlocks(rows, 'id').forEach(({ rows: r }) => {
      const columns = readScalar(r, 'columns');
      const heading = readLangPair(r, 'headline');
      const cells = splitHubSpokeCells(r);

      // Group flat cells back into rows-of-categories for hubSpokeNM.
      const rowMap = new Map();
      cells.forEach(({ row, col, rows: cellRows }) => {
        if (!rowMap.has(row)) rowMap.set(row, []);
        rowMap.get(row)[Number(col) - 1] = readHubSpokeCategory(cellRows);
      });
      const nmRows = [...rowMap.keys()]
        .sort((a, b) => a - b)
        .map((rowNum) => ({ categories: rowMap.get(rowNum).filter(Boolean) }));
      hubSpokeNM.push({ columns, heading, rows: nmRows });

      // Flatten every category (row-major order) into hubSpokeCard's flat
      // card list — name -> heading, image.linkValue promoted to a
      // sibling card.linkValue (hub-spoke-card.js's shape has no linkValue
      // nested inside image, unlike hubSpokeNM's categories).
      const flatCategories = cells
        .sort((a, b) => (a.row - b.row) || (a.col - b.col))
        .map(({ rows: cellRows }) => readHubSpokeCategory(cellRows));
      const flatCards = flatCategories.slice(0, HUB_SPOKE_CARD_MAX_CARDS).map((category) => ({
        image: {
          english: { searchText: category.image.english.searchText, altCopy: category.image.english.altCopy },
          french: { searchText: category.image.french.searchText, altCopy: category.image.french.altCopy },
        },
        heading: category.name,
        linkValue: {
          english: category.image.english.linkValue,
          french: category.image.french.linkValue,
        },
      }));
      hubSpokeCard.push({ title: heading, cards: flatCards });
    });

    return { hubSpokeNM, hubSpokeCard };
  }

  // =========================================================================
  // Hero POV — the most structurally complex sheet. See file header note
  // on the image slot-naming inconsistency handled positionally below.
  // =========================================================================
  const HERO_POV_MAX_CARDS = 5;

  // image/logo both split by device(web/app) x language x "slot" — but the
  // real sheet mislabels the second slot inconsistently (sometimes
  // "desktop", sometimes "tablet", regardless of device — confirmed via
  // testing against the real downloaded sheet). Reading positionally
  // instead of trusting the literal label: the first distinct base slot
  // name seen for a given device is always "mobile" (matches every sample
  // seen); any other slot name for that device is the second slot, whose
  // OUTPUT key is forced to "desktop" for web / "tablet" for app,
  // regardless of what text the sheet actually used.
  function readHeroPovImageSlots(rows, label) {
    const found = findLabelRow(rows, label);
    const result = {};
    if (!found) return result;

    let device = null;
    let lang = null;
    const slotOrderByDevice = {};
    for (let i = found.i; i < rows.length; i++) {
      const cells = normalizeRow(rows[i]);
      if (i > found.i && cells[0] != null) break;
      if (cells.every((c) => c == null)) continue;

      if (cells[1] != null) {
        device = cells[1];
        lang = null;
      }
      if (cells[2] != null) lang = cells[2];
      if (device == null || lang == null) continue;

      const rawSub = cells[3];
      if (rawSub == null) continue;
      const isAlt = rawSub.endsWith('-alt-copy');
      const baseName = isAlt ? rawSub.slice(0, -'-alt-copy'.length) : rawSub;

      if (!slotOrderByDevice[device]) slotOrderByDevice[device] = [];
      if (!slotOrderByDevice[device].includes(baseName)) slotOrderByDevice[device].push(baseName);
      const slotIndex = slotOrderByDevice[device].indexOf(baseName);
      const outSlot = slotIndex === 0 ? 'mobile' : device === 'app' ? 'tablet' : 'desktop';

      if (!result[device]) result[device] = {};
      if (!result[device][lang]) result[device][lang] = {};
      const value = cells[4] != null ? cells[4] : '';
      result[device][lang][isAlt ? `${outSlot}AltCopy` : outSlot] = value;
    }
    return result;
  }

  function readHeroPovLogo(rows) {
    const logo = readDeviceLangGroup(rows, 'logo', ['search-text', 'alt-copy']);
    const toLang = (deviceData) => ({
      english: { searchText: deviceData?.english?.['search-text'] || '', altCopy: deviceData?.english?.['alt-copy'] || '' },
      french: { searchText: deviceData?.french?.['search-text'] || '', altCopy: deviceData?.french?.['alt-copy'] || '' },
    });
    return { web: toLang(logo.web), app: toLang(logo.app) };
  }

  // Both devices' legal uses the same 5 subfield labels in the real sheet
  // (discloser/title/description/desktop-text-color/mobile-text-color) —
  // hero-pov.js's app legal only has ONE color field though, so for app
  // the color is read from whichever of desktop-text-color/
  // mobile-text-color/text-color is actually non-empty (handles the
  // mislabeling the same way the image reader does, without needing an
  // exact label match).
  function readHeroPovLegal(rows) {
    const subFields = ['discloser', 'title', 'description', 'desktop-text-color', 'mobile-text-color', 'text-color'];
    const legal = readDeviceLangGroup(rows, 'legal', subFields);
    const webSide = (langData) => ({
      discloser: langData?.discloser || '',
      title: langData?.title || '',
      description: langData?.description || '',
      desktopTextColor: langData?.['desktop-text-color'] || '',
      mobileTextColor: langData?.['mobile-text-color'] || '',
    });
    const appSide = (langData) => ({
      discloser: langData?.discloser || '',
      title: langData?.title || '',
      description: langData?.description || '',
      textColor: langData?.['desktop-text-color'] || langData?.['mobile-text-color'] || langData?.['text-color'] || '',
    });
    return {
      web: { english: webSide(legal.web?.english), french: webSide(legal.web?.french) },
      app: { english: appSide(legal.app?.english), french: appSide(legal.app?.french) },
    };
  }

  // headline/sub-headline/eyebrow share this shape: web has
  // desktopTextColor+mobileTextColor, app has one textColor — same
  // mislabeling-tolerant color fallback as legal above.
  function readHeroPovTextBlock(rows, label) {
    const subFields = ['text', 'desktop-text-color', 'mobile-text-color', 'text-color'];
    const group = readDeviceLangGroup(rows, label, subFields);
    const webSide = (langData) => ({
      text: langData?.text || '',
      desktopTextColor: langData?.['desktop-text-color'] || '',
      mobileTextColor: langData?.['mobile-text-color'] || '',
    });
    const appSide = (langData) => ({
      text: langData?.text || '',
      textColor: langData?.['desktop-text-color'] || langData?.['mobile-text-color'] || langData?.['text-color'] || '',
    });
    return {
      web: { english: webSide(group.web?.english), french: webSide(group.web?.french) },
      app: { english: appSide(group.app?.english), french: appSide(group.app?.french) },
    };
  }

  function parseHeroPov(rows) {
    return splitBlocks(rows, 'id').map(({ rows: r }) => {
      const cards = splitBlocks(r, 'Card').map(({ rows: cr }) => {
        const image = readHeroPovImageSlots(cr, 'image');
        const toImageLang = (deviceData) => ({
          english: deviceData?.english || {},
          french: deviceData?.french || {},
        });
        const cta = readDeviceLangGroup(cr, 'cta', ['link-text', 'link-value']);
        const toCta = (device) => ({
          english: { linkText: cta[device]?.english?.['link-text'] || '', linkValue: cta[device]?.english?.['link-value'] || '' },
          french: { linkText: cta[device]?.french?.['link-text'] || '', linkValue: cta[device]?.french?.['link-value'] || '' },
        });

        return {
          povStyle: readScalar(cr, 'pov-style'),
          backgroundColor: { web: readScalar(cr, 'background-color-web'), app: readScalar(cr, 'background-color-app') },
          image: { web: toImageLang(image.web), app: toImageLang(image.app) },
          logo: readHeroPovLogo(cr),
          legal: readHeroPovLegal(cr),
          headline: readHeroPovTextBlock(cr, 'headline'),
          subHeadline: readHeroPovTextBlock(cr, 'sub-headline'),
          eyebrow: readHeroPovTextBlock(cr, 'eyebrow'),
          cta: { web: toCta('web'), app: toCta('app') },
        };
      });
      return { cards };
    });
  }

  // =========================================================================
  const OUTLINE_SHEET_NAMES = {
    'page-info': 'page-info',
    'item-carousel': 'item-carousel',
    youtube: 'youtube',
    recipe: 'recipe',
    'inspiration-module': 'inspiration-module',
    accordion: 'accordion',
    'skinny-banner': 'skinny-banner',
    'pov-card': 'pov-card',
    'hub-spoke': 'hub-spoke',
    'hero-pov': 'hero-pov',
  };

  // Detects this format by checking for its characteristic lowercase-
  // hyphenated tab names (vs. the older wide format's Title Case names) —
  // used by popup.js to pick which parser to run without guessing from
  // content.
  function looksLikeOutlineWorkbook(sheetNames) {
    return sheetNames.includes('page-info') && sheetNames.includes('hero-pov');
  }

  function outlineSheetsToBrandPage(sheetsByName, pageId, brandName) {
    const brandPage = { pageId: pageId || '', brandName: brandName || '' };

    const assign = (key, list) => {
      if (Array.isArray(list) && list.length > 0) brandPage[key] = list;
    };

    if (sheetsByName['item-carousel']) assign('itemCarousel', parseItemCarousel(sheetsByName['item-carousel']));
    if (sheetsByName['youtube']) assign('youtube', parseYoutube(sheetsByName['youtube']));
    if (sheetsByName['recipe']) assign('recipe', parseRecipe(sheetsByName['recipe']));
    if (sheetsByName['inspiration-module']) {
      assign('inspirationModule', parseInspirationModule(sheetsByName['inspiration-module']));
    }
    if (sheetsByName['accordion']) assign('accordion', parseAccordion(sheetsByName['accordion']));
    if (sheetsByName['pov-card']) assign('povCard', parsePovCard(sheetsByName['pov-card']));
    if (sheetsByName['hero-pov']) assign('heroPov', parseHeroPov(sheetsByName['hero-pov']));

    if (sheetsByName['skinny-banner']) {
      const { imageAndTextSkinnyBanner, textOnlySkinnyBanner } = parseSkinnyBanner(sheetsByName['skinny-banner']);
      assign('imageAndTextSkinnyBanner', imageAndTextSkinnyBanner);
      assign('textOnlySkinnyBanner', textOnlySkinnyBanner);
    }

    if (sheetsByName['hub-spoke']) {
      const { hubSpokeNM, hubSpokeCard } = parseHubSpoke(sheetsByName['hub-spoke']);
      assign('hubSpokeNM', hubSpokeNM);
      assign('hubSpokeCard', hubSpokeCard);
    }

    return brandPage;
  }

  const XLSX_OUTLINE_MODULES_EXPORT = {
    OUTLINE_SHEET_NAMES,
    looksLikeOutlineWorkbook,
    outlineSheetsToBrandPage,
    parseItemCarousel,
    parseYoutube,
    parseRecipe,
    parseInspirationModule,
    parseAccordion,
    parseSkinnyBanner,
    parsePovCard,
    parseHubSpoke,
    parseHeroPov,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XLSX_OUTLINE_MODULES_EXPORT;
  } else {
    Object.assign(typeof window !== 'undefined' ? window : globalThis, XLSX_OUTLINE_MODULES_EXPORT);
  }
})(typeof window !== 'undefined' ? window : globalThis);
