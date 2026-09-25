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
            const lastChildSelector = `div[data-rbd-droppable-id="${zone.token}${position}"]>div:last-child`;
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
      const addModuleSelector = `span[data-e2eid="${zone.token}${zone.position}-pagesAddModule"]`;
      console.log('Add Module selector:', addModuleSelector);
      const addModuleBtn = await Helper.waitForElement(addModuleSelector);
      addModuleBtn.click();
      Helper.log(`Clicked Add Module for ${zone.token}${zone.position}.`);

      // Search the module explorer for the Hero POV module and select it.
      const searchInput = await Helper.waitForElement('input[data-testid="search-vms"]');
      Helper.setInputValue(searchInput, 'hero pov');
      Helper.log('Searched for Hero POV module.');

      const moduleLabel = await Helper.waitForElementByText('div[data-testid="module-explorer-id"]', 'HeroPov');
      const moduleCard = moduleLabel.parentElement.parentElement.parentElement;
      moduleCard.click();
      Helper.log('Selected Hero POV module.');

      const selectModuleBtn = await Helper.waitForElementByText('button[type="button"]', 'Select Module');
      selectModuleBtn.click();
      Helper.log('Clicked Select Module.');

      // TODO: fill the module name input (input[id="../name"]) using
      // ModuleNameBuilder once brandName is wired in from the parsed brief
      // workbook. Skipped for now — moving on to the next step.

      const tab3 = await Helper.waitForElement('ul[data-sui-list="container"]>li[name="tab-4"]');
      tab3.click();
      Helper.log('Clicked tab 4.');

      const startImmediate = await Helper.waitForElement('input[value="startImmediate"]');
      startImmediate.click();
      Helper.log('Selected start: immediate.');

      const endIndefinite = await Helper.waitForElement('input[value="endIndefinite"]');
      endIndefinite.click();
      Helper.log('Selected end: indefinite.');

      const priorityInput = await Helper.waitForElement('input[min="0"]');
      Helper.setInputValue(priorityInput, 30);
      Helper.log('Set priority to 30.');

      const tab0 = await Helper.waitForElement('ul[data-sui-list="container"] [name="tab-0"]');
      tab0.click();
      Helper.log('Clicked tab 0.');
    } catch (err) {
      Helper.fail(err);
    }
  };
}
