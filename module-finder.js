// Called directly by PageIdFounder right after it submits the Page
// Selection form (submitting is an in-place SPA transition, not a reload,
// so this runs in the same script context — no reload/resume handoff
// needed). Finds the first free module zone (top / content / bottom) and
// clicks its "Add Module" button.
//
// A zone position is free when its droppable container's last child div has
// an inline style of height: 0px. Zone position numbers are 1-based and go
// up to each zone's max slot count.

class ModuleFinder {
  // All selectors used by this flow, grouped by step. The zone-based ones
  // are functions since they're built from a token + position pair.
  static SELECTORS = {
    zoneLastChild: (token, position) => `div[data-rbd-droppable-id="${token}${position}"]>div:last-child`,
    addModule: (token, position) => `span[data-e2eid="${token}${position}-pagesAddModule"]`,
    moduleSearchInput: 'input[data-testid="search-vms"]',
    moduleExplorerItem: 'div[data-testid="module-explorer-id"]',
    selectModuleButton: 'button[type="button"]',
    scheduleTab: 'ul[data-sui-list="container"]>li[name="tab-4"]',
    contentTab: 'ul[data-sui-list="container"] [name="tab-0"]',
    startImmediate: 'input[value="startImmediate"]',
    endIndefinite: 'input[value="endIndefinite"]',
    priorityInput: 'input[min="0"]',
    loadingOverlay: 'div[data-focus-lock-disabled="false"]',
  };

  // Zone layout differs by device type: web pages have three zones, app
  // pages have a single content zone.
  static ZONES = {
    web: [
      { token: 'topZone', max: 5 },
      { token: 'contentZone', max: 30 },
      { token: 'bottomZone', max: 5 },
    ],
    app: [
      { token: 'contentZone', max: 40 },
    ],
  };

  static waitForFreeZone = (deviceType, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      let interval;
      let timer;
      const check = () => {
        for (const zone of ModuleFinder.ZONES[deviceType]) {
          for (let position = 1; position <= zone.max; position++) {
            const lastChildSelector = ModuleFinder.SELECTORS.zoneLastChild(zone.token, position);
            const lastChild = document.querySelector(lastChildSelector);
            console.log(lastChildSelector, lastChild, lastChild && lastChild.style.height);
            if (lastChild && lastChild.style.height === '0px') {
              clearInterval(interval);
              clearTimeout(timer);
              resolve({ token: zone.token, position });
              return;
            }
          }
        }
      };
      interval = setInterval(check, 200);
      check();
      timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timed out waiting for a free module zone'));
      }, timeout);
    });
  };

  static run = async (deviceType, moduleKey = 'HeroPov') => {
    try {
      Helper.log('Looking for a free module zone...');

      const zone = await ModuleFinder.waitForFreeZone(deviceType);
      Helper.log(`Found free zone: ${zone.token}${zone.position}`);

      // Assumes the Add Module button's e2eid mirrors the droppable zone's
      // id (e.g. a free "contentZone5" clicks "contentZone5-pagesAddModule").
      // Only confirmed against the topZone example given — verify against
      // the console log below if content/bottom zones misbehave.
      const addModuleSelector = ModuleFinder.SELECTORS.addModule(zone.token, zone.position);
      console.log('Add Module selector:', addModuleSelector);
      const addModuleBtn = await Helper.waitForElement(addModuleSelector);
      addModuleBtn.click();
      Helper.log(`Clicked Add Module for ${zone.token}${zone.position}.`);

      // Search the module explorer for the requested module and select it.
      // moduleKey is PascalCase (e.g. "HeroPov") matching the explorer item's
      // text; the search box takes the same key space-separated and lowercased.
      const searchQuery = moduleKey.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      const searchInput = await Helper.waitForElement(ModuleFinder.SELECTORS.moduleSearchInput);
      Helper.setInputValue(searchInput, searchQuery);
      Helper.log(`Searched for ${moduleKey} module.`);

      const moduleLabel = await Helper.waitForElementByText(
        ModuleFinder.SELECTORS.moduleExplorerItem,
        moduleKey
      );
      const moduleCard = moduleLabel.parentElement.parentElement.parentElement;
      moduleCard.click();
      Helper.log(`Selected ${moduleKey} module.`);

      const selectModuleBtn = await Helper.waitForElementByText(
        ModuleFinder.SELECTORS.selectModuleButton,
        'Select Module'
      );
      selectModuleBtn.click();
      Helper.log('Clicked Select Module.');

      await Helper.waitForElementGone(ModuleFinder.SELECTORS.loadingOverlay);
      Helper.log('Loading overlay gone.');

      // TODO: fill the module name input (input[id="../name"]) using
      // ModuleNameBuilder once brandName is wired in from the parsed brief
      // workbook. Skipped for now — moving on to the next step.

      const scheduleTab = await Helper.waitForElement(ModuleFinder.SELECTORS.scheduleTab);
      scheduleTab.click();
      Helper.log('scheduleTab tab 4.');

      const startImmediate = await Helper.waitForElement(ModuleFinder.SELECTORS.startImmediate);
      startImmediate.click();
      Helper.log('Selected start: immediate.');
      await Helper.sleep(500);

      const endIndefinite = await Helper.waitForElement(ModuleFinder.SELECTORS.endIndefinite);
      endIndefinite.click();
      Helper.log('Selected end: indefinite.');
      await Helper.sleep(500);

      const priorityInput = await Helper.waitForElement(ModuleFinder.SELECTORS.priorityInput);
      Helper.setInputValue(priorityInput, 30);
      Helper.log('Set priority to 30.');
      await Helper.sleep(500);

      const contentTab = await Helper.waitForElement(ModuleFinder.SELECTORS.contentTab);
      contentTab.click();
      Helper.log('contentTab Clicked tab 0.');
    } catch (err) {
      Helper.fail(err);
    }
  };
}
