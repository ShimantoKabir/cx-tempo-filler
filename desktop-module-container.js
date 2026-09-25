// Called directly by PageIdFounder right after it submits the Page
// Selection form (submitting is an in-place SPA transition, not a reload,
// so this runs in the same script context — no reload/resume handoff
// needed). Finds the first free module zone (top / content / bottom) and
// clicks its "Add Module" button.
//
// A zone position is free when its droppable container's last child div has
// an inline style of height: 0px. Zone position numbers are 1-based and go
// up to each zone's max slot count.

class DesktopModuleContainer {
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
  };

  static ZONES = [
    { token: 'topZone', max: 5 },
    { token: 'contentZone', max: 30 },
    { token: 'bottomZone', max: 5 },
  ];

  static waitForFreeZone = (timeout = 10000) => {
    return new Promise((resolve, reject) => {
      let interval;
      let timer;
      const check = () => {
        for (const zone of DesktopModuleContainer.ZONES) {
          for (let position = 1; position <= zone.max; position++) {
            const lastChildSelector = DesktopModuleContainer.SELECTORS.zoneLastChild(zone.token, position);
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

  static run = async () => {
    try {
      Helper.log('Looking for a free module zone...');

      const zone = await DesktopModuleContainer.waitForFreeZone();
      Helper.log(`Found free zone: ${zone.token}${zone.position}`);

      // Assumes the Add Module button's e2eid mirrors the droppable zone's
      // id (e.g. a free "contentZone5" clicks "contentZone5-pagesAddModule").
      // Only confirmed against the topZone example given — verify against
      // the console log below if content/bottom zones misbehave.
      const addModuleSelector = DesktopModuleContainer.SELECTORS.addModule(zone.token, zone.position);
      console.log('Add Module selector:', addModuleSelector);
      const addModuleBtn = await Helper.waitForElement(addModuleSelector);
      addModuleBtn.click();
      Helper.log(`Clicked Add Module for ${zone.token}${zone.position}.`);

      // Search the module explorer for the Hero POV module and select it.
      const searchInput = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.moduleSearchInput);
      Helper.setInputValue(searchInput, 'hero pov');
      Helper.log('Searched for Hero POV module.');

      const moduleLabel = await Helper.waitForElementByText(
        DesktopModuleContainer.SELECTORS.moduleExplorerItem,
        'HeroPov'
      );
      const moduleCard = moduleLabel.parentElement.parentElement.parentElement;
      moduleCard.click();
      Helper.log('Selected Hero POV module.');

      const selectModuleBtn = await Helper.waitForElementByText(
        DesktopModuleContainer.SELECTORS.selectModuleButton,
        'Select Module'
      );
      selectModuleBtn.click();
      Helper.log('Clicked Select Module.');

      // TODO: fill the module name input (input[id="../name"]) using
      // ModuleNameBuilder once brandName is wired in from the parsed brief
      // workbook. Skipped for now — moving on to the next step.

      const scheduleTab = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.scheduleTab);
      scheduleTab.click();
      Helper.log('scheduleTab tab 4.');

      const startImmediate = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.startImmediate);
      startImmediate.click();
      Helper.log('Selected start: immediate.');
      await Helper.sleep(500);

      const endIndefinite = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.endIndefinite);
      endIndefinite.click();
      Helper.log('Selected end: indefinite.');
      await Helper.sleep(500);

      const priorityInput = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.priorityInput);
      Helper.setInputValue(priorityInput, 30);
      Helper.log('Set priority to 30.');
      await Helper.sleep(500);

      const contentTab = await Helper.waitForElement(DesktopModuleContainer.SELECTORS.contentTab);
      contentTab.click();
      Helper.log('contentTab Clicked tab 0.');
    } catch (err) {
      Helper.fail(err);
    }
  };
}
