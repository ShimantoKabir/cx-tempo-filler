class ModuleNameBuilder {
  // Maps a kebab-case module type to its name template.
  static MODULE_TEMPLATES = {
    'hero-pov': (p) => `${p.prefix}${p.brandName} Brand CP Hero POV ${p.timeSuffix}`,
    'hub-spokes-4x1': (p) => `${p.prefix}${p.brandName} Brand CP HubSpokes 4x1 ${p.timeSuffix}`,
    'hub-spokes-nxm': (p) => `${p.prefix}${p.brandName} Brand CP HubSpokes ${p.gridLayout} ${p.timeSuffix}`,
    'item-carousel': (p) => `${p.prefix}${p.brandName} Brand CP Carousel ${p.timeSuffix}`,
    'pov-cards': (p) => `${p.prefix}${p.brandName} Brand CP POV Cards ${p.timeSuffix}`,
    'skinny-banner': (p) => `${p.prefix}${p.brandName} Brand CP Skinny Banner ${p.timeSuffix}`,
    'pov-carousel': (p) => `${p.prefix}${p.brandName} CP POV Carousel ${p.timeSuffix}`,
    'text-only-skinny-banner': (p) => `${p.prefix}${p.brandName} CP Text Only Skinny Banner ${p.timeSuffix}`,
  };

  /**
   * Calculates the current ISO week number for a given date.
   * @param {Date} date
   * @returns {number} ISO Week Number
   */
  static getISOWeekNumber = (date = new Date()) => {
    const target = new Date(date.valueOf());
    const dayNumber = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNumber + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.round((firstThursday - target) / 604800000);
  };

  /**
   * Generates a single Tempo CMS module name.
   * @param {string} brandName - The name of the brand page (e.g., "KCC PUP Silver")
   * @param {string} moduleType - Kebab-case module key, e.g. "hero-pov"
   * @param {string} deviceType - "mobile" or "desktop"; mobile prepends "App "
   * @param {Object} options - Optional parameters (custom week, year, NxM grid layout)
   */
  static generateTempoModuleName = (brandName, moduleType, deviceType, options = {}) => {
    const template = ModuleNameBuilder.MODULE_TEMPLATES[moduleType];
    if (!template) {
      throw new Error(`Unknown module type: ${moduleType}`);
    }

    const today = new Date();
    const week = options.week || ModuleNameBuilder.getISOWeekNumber(today);
    const year = options.year || today.getFullYear();
    const gridLayout = options.gridLayout || "2x6";
    const prefix = deviceType === 'mobile' ? 'App ' : '';
    const timeSuffix = `Week ${week} ${year}`;

    return template({ brandName, prefix, timeSuffix, gridLayout });
  };
}
