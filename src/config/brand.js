/**
 * Centralized brand configuration.
 * Every place in the UI that needs the company/product name, website,
 * support email or tagline must read it from here instead of hard-coding it.
 */
const brand = {
  name: 'Gowebkart',
  legalName: 'Gowebkart Pvt Ltd',
  website: 'gowebkart.in',
  websiteUrl: 'https://gowebkart.in',
  supportEmail: 'support@gowebkart.in',
  productName: 'Social',
  tagline: 'One Dashboard. Every Social.',
  copyrightYear: new Date().getFullYear(),
  // Money in ads, budgets and reports is shown in this currency.
  currency: 'INR',
  currencyLocale: 'en-IN',
};

export default brand;
