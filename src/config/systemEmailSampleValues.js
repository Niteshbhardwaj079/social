import brand from './brand';

// Brand tokens are available in every email (the shared footer uses them) and
// come straight from config/brand.js — change the brand there and every
// template, preview and future real send picks it up. Nothing here is copied.
export const BRAND_EMAIL_TOKENS = {
  app_name: brand.productName,
  company: brand.legalName,
  support_email: brand.supportEmail,
  website: brand.websiteUrl,
  year: String(brand.copyrightYear),
};

// Sample values used only to make the Preview tab readable — substituted
// into {{variable}} tokens client-side. The real backend fills these in
// with actual data when an email is sent.
const SYSTEM_EMAIL_SAMPLE_VALUES = {
  ...BRAND_EMAIL_TOKENS,
  user_name: 'Priya Sharma',
  reset_link: '#',
  expires_in: '30 minutes',
  changed_at: 'Sep 19, 2026, 10:42 AM',
  device: 'Chrome on Windows',
  location: 'Mumbai, India',
  signed_in_at: 'Sep 19, 2026, 10:42 AM',
  invited_by: 'Nitesh Bhardwaj',
  role: 'Editor',
  accept_link: '#',
  new_user_name: 'Vikram Singh',
  new_user_email: 'vikram@gowebkart.in',
  added_by: 'Nitesh Bhardwaj',
  users_url: '#',
  old_role: 'Contributor',
  new_role: 'Editor',
  changed_by: 'Nitesh Bhardwaj',
  provider: 'Instagram Business',
  account_name: 'gowebkart.in',
  connected_by: 'Priya Sharma',
  connected_at: 'Sep 19, 2026, 10:42 AM',
  accounts_url: '#',
  post_excerpt: 'Thank you for 25,000 followers!',
  platforms: 'Instagram, Facebook',
  published_at: 'Sep 19, 2026, 10:42 AM',
  post_url: '#',
  error_reason: 'the connected account token expired',
  posts_url: '#',
  submitted_by: 'Priya Sharma',
  approvals_url: '#',
  decision: 'approved',
  reviewer: 'Nitesh Bhardwaj',
  reason: 'Looks great — ready to publish.',
  commenter_name: 'Sara Khan',
  comment_text: 'Love this!',
  inbox_url: '#',
};

export function renderEmailPreview(template) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => SYSTEM_EMAIL_SAMPLE_VALUES[key] ?? match);
}

export default SYSTEM_EMAIL_SAMPLE_VALUES;
