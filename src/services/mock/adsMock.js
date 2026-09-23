import { PLATFORM_KEYS } from '../../config/platforms';
import { AD_STATUS } from '../../config/adPlatforms';

// The mock data ends here — "today" as far as the sample numbers are concerned.
export const AD_DATA_END_DATE = '2026-09-18';

// Discovered ad accounts (mock stand-in for "Sync Ad Accounts" against a real Facebook connection).
export const adAccountsMock = [
  {
    id: 'adacc-1',
    network: 'meta',
    externalAccountId: 'act_4128837701',
    name: 'Gowebkart Ads',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    accountStatus: '1',
    businessName: 'Gowebkart Pvt Ltd',
    disableReason: null,
    lastSyncedAt: '2026-09-20T09:00:00Z',
  },
];
export const adAccountStatusMock = { facebookConnected: true, hasAdsToken: true, hasAdsPermission: true };

// Small seeded random so the sample charts look the same on every load.
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Builds a believable daily history between the ad's start and end (never past the mock "today").
function buildDaily({ seed, startDate, endDate, dailySpend, cpm, ctr, conversionRate }) {
  const random = seededRandom(seed);
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const finish = Math.min(new Date(`${endDate}T00:00:00Z`).getTime(), new Date(`${AD_DATA_END_DATE}T00:00:00Z`).getTime());
  const days = [];
  for (let time = start; time <= finish; time += DAY_MS) {
    const dayIndex = (time - start) / DAY_MS;
    const ramp = Math.min(1, 0.55 + dayIndex * 0.08); // ads warm up over the first few days
    const spend = Math.round(dailySpend * ramp * (0.85 + random() * 0.3));
    const impressions = Math.round((spend / cpm) * 1000 * (0.9 + random() * 0.2));
    const clicks = Math.round(impressions * ctr * (0.8 + random() * 0.4));
    const conversions = Math.round(clicks * conversionRate * (0.7 + random() * 0.6));
    days.push({ date: new Date(time).toISOString().slice(0, 10), spend, impressions, clicks, conversions });
  }
  return days;
}

function makeAd(base, metrics) {
  return {
    adAccountId: adAccountsMock[0].id,
    adAccountName: adAccountsMock[0].name,
    ...base,
    daily: metrics ? buildDaily({ ...metrics, startDate: base.startDate, endDate: base.endDate }) : [],
  };
}

const creative = (headline, text, cta, destinationUrl) => ({ headline, text, cta, destinationUrl, mediaId: null });
const audience = (extra = {}) => ({ locations: ['India'], ageMin: 18, ageMax: 45, gender: 'all', interests: [], ...extra });

const adsMock = [
  makeAd(
    {
      id: 'ad-1', name: 'Diwali Offer — Website Traffic', objective: 'traffic', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 1500, startDate: '2026-08-25', endDate: '2026-10-15', createdAt: '2026-08-24T10:00:00Z', createdBy: 'Priya Sharma',
      creative: creative('Diwali offer — up to 40% off', 'Light up your Diwali with our biggest offer of the year. Limited time only.', 'Shop now', 'https://gowebkart.in/diwali-offer'),
      audience: audience({ interests: ['Fashion', 'Home & garden'], ageMax: 55 }),
    },
    { seed: 11, dailySpend: 1500, cpm: 82, ctr: 0.021, conversionRate: 0.045 }
  ),
  makeAd(
    {
      id: 'ad-13', name: 'Always-on Brand Awareness', objective: 'awareness', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 3500, startDate: '2026-05-01', endDate: '2026-12-31', createdAt: '2026-04-29T10:00:00Z', createdBy: 'Nitesh Bhardwaj',
      creative: creative('Gowebkart — social media made simple', 'Manage every channel from one dashboard.', 'Learn more', 'https://gowebkart.in'),
      audience: audience({ interests: ['Business', 'Technology'] }),
    },
    { seed: 99, dailySpend: 3500, cpm: 78, ctr: 0.011, conversionRate: 0.018 }
  ),
  makeAd(
    {
      id: 'ad-2', name: 'Product Launch — Awareness', objective: 'awareness', network: 'meta',
      platforms: [PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 2000, startDate: '2026-09-01', endDate: '2026-09-30', createdAt: '2026-08-30T10:00:00Z', createdBy: 'Nitesh Bhardwaj',
      creative: creative('Meet the new Social dashboard', 'One dashboard for every social channel. See what is new.', 'Learn more', 'https://gowebkart.in/launch'),
      audience: audience({ interests: ['Technology', 'Business'] }),
    },
    { seed: 22, dailySpend: 2000, cpm: 74, ctr: 0.013, conversionRate: 0.02 }
  ),
  makeAd(
    {
      id: 'ad-3', name: 'Lead Gen — Free Demo', objective: 'leads', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 1200, startDate: '2026-09-05', endDate: '2026-10-05', createdAt: '2026-09-04T10:00:00Z', createdBy: 'Rahul Verma',
      creative: creative('Book a free 20-minute demo', 'See how teams manage every channel from one place.', 'Sign up', 'https://gowebkart.in/demo'),
      audience: audience({ interests: ['Business'], ageMin: 25, ageMax: 54 }),
    },
    { seed: 33, dailySpend: 1200, cpm: 96, ctr: 0.017, conversionRate: 0.06 }
  ),
  makeAd(
    {
      id: 'ad-4', name: 'YouTube Walkthrough Promo', objective: 'engagement', network: 'google',
      platforms: [PLATFORM_KEYS.YOUTUBE], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 800, startDate: '2026-09-08', endDate: '2026-10-08', createdAt: '2026-09-07T10:00:00Z', createdBy: 'Rahul Verma',
      creative: creative('Composer walkthrough in 2 minutes', 'Watch how a post goes from idea to published.', 'Learn more', 'https://youtu.be/example'),
      audience: audience({ interests: ['Technology', 'Education'] }),
    },
    { seed: 44, dailySpend: 800, cpm: 60, ctr: 0.011, conversionRate: 0.015 }
  ),
  makeAd(
    {
      id: 'ad-5', name: 'LinkedIn B2B Webinar', objective: 'leads', network: 'linkedin',
      platforms: [PLATFORM_KEYS.LINKEDIN], status: AD_STATUS.ACTIVE,
      budgetType: 'daily', budget: 2500, startDate: '2026-09-10', endDate: '2026-09-28', createdAt: '2026-09-09T10:00:00Z', createdBy: 'Nitesh Bhardwaj',
      creative: creative('Free webinar: grow your brand in 2026', 'Join 500+ marketers. Live Q&A included.', 'Sign up', 'https://gowebkart.in/webinar'),
      audience: audience({ interests: ['Business', 'Education'], ageMin: 25, ageMax: 60 }),
    },
    { seed: 55, dailySpend: 2500, cpm: 480, ctr: 0.009, conversionRate: 0.05 }
  ),
  makeAd(
    {
      id: 'ad-6', name: 'Summer Sale — Retargeting', objective: 'sales', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.PAUSED,
      budgetType: 'daily', budget: 900, startDate: '2026-08-10', endDate: '2026-09-30', createdAt: '2026-08-09T10:00:00Z', createdBy: 'Priya Sharma',
      creative: creative('Still thinking it over?', 'Your cart is waiting — complete your order today.', 'Shop now', 'https://gowebkart.in/cart'),
      audience: audience({ interests: ['Fashion'] }),
    },
    { seed: 66, dailySpend: 900, cpm: 110, ctr: 0.025, conversionRate: 0.08 }
  ),
  makeAd(
    {
      id: 'ad-7', name: 'Eid Greetings Boost', objective: 'awareness', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK], status: AD_STATUS.COMPLETED,
      budgetType: 'lifetime', budget: 12000, startDate: '2026-08-15', endDate: '2026-09-05', createdAt: '2026-08-14T10:00:00Z', createdBy: 'Rahul Verma',
      creative: creative('Eid Mubarak from all of us', 'Wishing you and your family joy and peace.', 'Learn more', 'https://gowebkart.in'),
      audience: audience({ locations: ['India', 'UAE'] }),
    },
    { seed: 77, dailySpend: 550, cpm: 68, ctr: 0.012, conversionRate: 0.01 }
  ),
  makeAd(
    {
      id: 'ad-8', name: 'Brand Story Video', objective: 'engagement', network: 'google',
      platforms: [PLATFORM_KEYS.YOUTUBE], status: AD_STATUS.COMPLETED,
      budgetType: 'lifetime', budget: 9000, startDate: '2026-08-01', endDate: '2026-08-31', createdAt: '2026-07-30T10:00:00Z', createdBy: 'Nitesh Bhardwaj',
      creative: creative('The story behind Gowebkart', 'Meet the people building Social.', 'Learn more', 'https://youtu.be/example2'),
      audience: audience({ interests: ['Business'] }),
    },
    { seed: 88, dailySpend: 300, cpm: 55, ctr: 0.009, conversionRate: 0.012 }
  ),
  makeAd(
    {
      id: 'ad-9', name: 'New Year Preview', objective: 'traffic', network: 'meta',
      platforms: [PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.SCHEDULED,
      budgetType: 'daily', budget: 1000, startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '2026-09-17T10:00:00Z', createdBy: 'Priya Sharma',
      creative: creative('A first look at what is next', 'Be the first to see our new range.', 'Learn more', 'https://gowebkart.in/preview'),
      audience: audience(),
    },
    null
  ),
  makeAd(
    {
      id: 'ad-10', name: 'Customer Spotlight Boost', objective: 'engagement', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK], status: AD_STATUS.IN_REVIEW,
      budgetType: 'daily', budget: 700, startDate: '2026-09-19', endDate: '2026-09-26', createdAt: '2026-09-18T09:00:00Z', createdBy: 'Rahul Verma',
      creative: creative('How ABC Retail grew 3x', 'A real customer story.', 'Learn more', 'https://gowebkart.in/stories/abc'),
      audience: audience(),
    },
    null
  ),
  makeAd(
    {
      id: 'ad-11', name: 'Old Banner Test', objective: 'traffic', network: 'meta',
      platforms: [PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.REJECTED,
      budgetType: 'daily', budget: 500, startDate: '2026-09-12', endDate: '2026-09-20', createdAt: '2026-09-11T10:00:00Z', createdBy: 'Nitesh Bhardwaj',
      rejectionReason: 'The image has too much text. Meta needs less than 20% of the picture to be text.',
      creative: creative('Big sale this week', 'Everything must go.', 'Shop now', 'https://gowebkart.in/sale'),
      audience: audience(),
    },
    null
  ),
  makeAd(
    {
      id: 'ad-12', name: 'Winter Collection (draft)', objective: 'sales', network: 'meta',
      platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM], status: AD_STATUS.DRAFT,
      budgetType: 'daily', budget: 1800, startDate: '2026-11-01', endDate: '2026-11-30', createdAt: '2026-09-16T10:00:00Z', createdBy: 'Priya Sharma',
      creative: creative('Winter is coming', 'Warm looks for every mood.', 'Shop now', 'https://gowebkart.in/winter'),
      audience: audience({ interests: ['Fashion'] }),
    },
    null
  ),
];

export default adsMock;
