// Fills a recipe card via the generic "Custom HTML" module, web only (per
// scratch.txt: "this module is only for web"). Same Custom HTML module as
// Youtube — no dedicated CMS fields, just en/fr markup textareas that get a
// hand-built HTML blob per scratch.txt's captured template.
//
// module search text: "Custom HTML", module find key: "CustomHtml" (see
// scratch.txt) — page-id-founder.js calls ModuleFinder.run with those
// before handing off to Recipe.run.

class Recipe {
  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    markupEn: 'textarea[data-e2eid="markup"]',
    markupFr: 'textarea[data-e2eid="fr_markup"]',
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  // scratch.txt's captured template hardcodes English "Prep Time:"/"Cook
  // Time:"/"Serving Size:" labels with no brief field for a French
  // equivalent (unlike ingredientsLabel/directionsLabel, which the brief
  // does carry per-language). The brief can now optionally supply its own
  // via recipe.prepTimeLabel/cookTimeLabel/servingSizeLabel (each
  // {english, french}, same shape as ingredientsLabel) — these are only the
  // fallback when the brief doesn't, so a brief that never sets them still
  // gets something reasonable rather than an empty label.
  static SUB_LABELS = {
    english: { prepTime: 'Prep Time:', cookTime: 'Cook Time:', servingSize: 'Serving Size:' },
    french: { prepTime: 'préparation :', cookTime: 'cuisson :', servingSize: 'Portions :' },
  };

  // Brief-supplied label wins; falls back to SUB_LABELS otherwise.
  static resolveLabel = (data, field, language) => data?.[field]?.[language] || Recipe.SUB_LABELS[language][field];

  // Brief text gets dropped straight into HTML (markup, attributes, and
  // list items) — escape it so a stray &, <, >, or quote in a title/
  // ingredient/direction can't break the markup.
  static escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  static buildIngredientsHtml = (ingredients) =>
    (Array.isArray(ingredients) ? ingredients : []).map((item) => Recipe.escapeHtml(item)).join(' <br> ');

  static buildDirectionsHtml = (directions) =>
    (Array.isArray(directions) ? directions : [])
      .map((item) => `<li>${Recipe.escapeHtml(item)}</li>`)
      .join('\n            ');

  // Per scratch.txt's captured template — styles are duplicated into every
  // instance since this module has no shared stylesheet of its own.
  static buildRecipeHtml = (data, language) => {
    const e = Recipe.escapeHtml;
    const labels = {
      prepTime: Recipe.resolveLabel(data, 'prepTimeLabel', language),
      cookTime: Recipe.resolveLabel(data, 'cookTimeLabel', language),
      servingSize: Recipe.resolveLabel(data, 'servingSizeLabel', language),
    };
    return `<style>
    @media only screen and (max-width: 690px) {
        .marsDirectionsContainer23 {
        padding: 10px 0px !important;
        width: 100% !important;
        }
    }

    h1,
    h2,
    h3 {
        font-weight: bold;
        margin-bottom: 0;
    }

    h1 {
        font-size: 24px;
    }

    h2 {
        font-size: 20px;
    }

    h3 {
        font-size: 16px;
    }

    p {
        line-height: 1.5;
        margin: 5px 0;
    }

    ul,
    ol {
        margin: 0;
        display: block;
    }

    li {
        margin-bottom: 10px;
        padding: 0;
    }

    a {
        text-decoration: underline;
    }

    a:hover {
        cursor: pointer;
    }

    .sm_txt {
        font-size: 12px;
    }

    section {
        display: inline-block;
    }

    .p20 {
        padding-left: 20px;
        padding-right: 20px;
    }

    .recipe-wrapper {
        background: #FFFFFF;
        padding: 20px;
        width: 90%;
        margin: 0 auto;
        font-family: Bogle, Helvetica Neue, Helvetica, Arial, sans-serif;
        border: rgb(216, 216, 216) 1px solid;
        border-radius: 8px;
    }

    .recipe-img-cont {
        display: inline-block;
        float: left;
        text-align: center;
        vertical-align: top;
        min-width: 300px;
        max-width: 100%;
        width: -webkit-calc(292000px - 48000%);
        min-width: -webkit-calc(48%);
        width: calc(292000px - 48000%);
        min-width: calc(48%);
    }

    .recipe-img {
        max-width: 640px;
        width: 100%;
        border-radius: 10px;
    }

    .recipe-copy {
        display: inline-block;
        float: right;
        text-align: left;
        font-size: 1rem;
        vertical-align: top;
        min-width: 300px;
        max-width: 100%;
        width: -webkit-calc(292000px - 48000%);
        min-width: -webkit-calc(48%);
        width: calc(292000px - 48000%);
        min-width: calc(48%);
    }

    .sub-copy-title {
        font-size: 0.9rem;
        font-weight: bold;
    }

    .sub-copy-desc {
        font-size: 1.15rem;
        font-weight: bold;
    }

    .recipe-sub-container {
        display: flex;
    }

    .recipe-sub-child {
        margin-right: 50px;
    }

    .recipe-hr {
        border: rgb(216, 216, 216) 1px solid;
    }

    .marsDirectionsContainer23 {
        padding: 10px 20px;
        width: 90%;
        margin: 0 auto;
        text-align: left;
        font-size: 1rem;
        vertical-align: top;
    }

    .directions-inner {
        display: inline-block;
    }

    .ingredients-text {
        font-size: 1rem;
    }

    .clearfix {
        clear: both;
    }
    </style>
    <div class="recipe-wrapper">
    <div>
        <div class="recipe-img-cont">
        <img class="recipe-img" src="${e(data.image?.[language])}" alt="${e(data.alt?.[language])}">
        </div>
        <div class="recipe-copy">
        <h1>${e(data.title?.[language])}</h1>
        <p>${e(data.subhead?.[language])}</p>
        <div class="recipe-sub-container">
            <div class="recipe-sub-child">
            <p>
                <span class="sub-copy-title">${e(labels.prepTime)}</span>
                <br>
                <span class="sub-copy-desc">${e(data.prepTime?.[language])}</span>
            </p>
            </div>
            <div class="recipe-sub-child">
            <p>
                <span class="sub-copy-title">${e(labels.cookTime)}</span>
                <br>
                <span class="sub-copy-desc">${e(data.cookTime?.[language])}</span>
            </p>
            </div>
            <div class="recipe-sub-child">
            <p>
                <span class="sub-copy-title">${e(labels.servingSize)}</span>
                <br>
                <span class="sub-copy-desc">${e(data.servingSize?.[language])}</span>
            </p>
            </div>
        </div>
        <h3>${e(data.ingredientsLabel?.[language])}</h3>
        <p>
            <span class="ingredients-text"> ${Recipe.buildIngredientsHtml(data.ingredients?.[language])} </span>
        </p>
        </div>
        <div class="clearfix"></div>
    </div>
    <hr class="recipe-hr">
    <div class="marsDirectionsContainer23">
        <div class="directions-inner">
        <p>
            <b>${e(data.directionsLabel?.[language])}</b>
        </p>
        <ol>
            ${Recipe.buildDirectionsHtml(data.directions?.[language])}
        </ol>
        <br>
        <br>
        </div>
        <div class="clearfix"></div>
    </div>
    </div>
    </div>`;
  };

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
  // brandPage.recipe is an array of independent module instances (same
  // "multi" pattern as itemCarousel/hubSpokeCard) — index picks which one.
  static run = async (deviceType, brandPage, index, navigateBackAfterSave = true) => {
    if (deviceType !== 'web') {
      throw new Error('Recipe (Custom HTML embed) is web-only — page-id-founder.js should never call this for app.');
    }

    const recipe = brandPage.recipe?.[index];
    if (!recipe) throw new Error(`Brief is missing recipe[${index}] data`);

    Helper.log('Filling Recipe (Custom HTML) module...');

    // When the brief has more than one Recipe, append a 1-based sequence
    // number so the generated names aren't all identical (same convention
    // as item-carousel.js/hub-spoke-card.js).
    const total = Array.isArray(brandPage.recipe) ? brandPage.recipe.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'recipe', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }
    await Recipe.setValue(Recipe.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    await Recipe.setValue(Recipe.SELECTORS.markupEn, Recipe.buildRecipeHtml(recipe, 'english'));
    await Recipe.setValue(Recipe.SELECTORS.markupFr, Recipe.buildRecipeHtml(recipe, 'french'));
    Helper.log('Filled en/fr HTML markup.');

    Helper.log('Recipe module filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `recipe-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(
      Recipe.SELECTORS.saveButton,
      Recipe.SELECTORS.discardButton,
      navigateBackAfterSave,
      moduleRecord
    );
  };
}
