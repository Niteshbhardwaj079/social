import { MEDIA_TYPE } from '../../config/constants';
import brand from '../../config/brand';

// `usedIn` is what the Phase 2 backend will derive from posts, the recycling
// queue and email templates that reference a file. The Media Library reads it to
// warn before a delete: published posts are safe (the platforms hold their own
// copy); scheduled/draft posts, recycling and emails would break.
const publicUrl = (name) => `${brand.websiteUrl}/uploads/${name}`;

const mediaMock = [
  {
    id: 'media-1', type: MEDIA_TYPE.IMAGE, name: 'product-launch-hero.jpg', url: null, folder: 'Campaigns',
    tags: ['launch', 'hero'], sizeKb: 842, width: 1600, height: 900, uploadedBy: 'Priya Sharma',
    uploadedAt: '2026-09-15T10:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('product-launch-hero.jpg'),
    usedIn: [
      { kind: 'post', status: 'published', title: 'Product launch teaser' },
      { kind: 'post', status: 'scheduled', title: 'Launch day countdown' },
    ],
  },
  {
    id: 'media-2', type: MEDIA_TYPE.IMAGE, name: 'team-photo.jpg', url: null, folder: 'Brand',
    tags: ['team'], sizeKb: 1204, width: 2000, height: 1333, uploadedBy: 'Nitesh Bhardwaj',
    uploadedAt: '2026-09-10T09:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('team-photo.jpg'),
    usedIn: [{ kind: 'post', status: 'published', title: 'Behind the scenes at Gowebkart' }],
  },
  {
    id: 'media-3', type: MEDIA_TYPE.VIDEO, name: 'composer-walkthrough.mp4', url: null, folder: 'Product',
    tags: ['product', 'demo'], sizeKb: 15400, width: null, height: null, uploadedBy: 'Rahul Verma',
    uploadedAt: '2026-09-16T14:30:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('composer-walkthrough.mp4'),
    usedIn: [{ kind: 'post', status: 'published', title: 'Composer walkthrough' }],
  },
  {
    id: 'media-4', type: MEDIA_TYPE.IMAGE, name: 'diwali-offer-banner.png', url: null, folder: 'Campaigns',
    tags: ['diwali', 'offer'], sizeKb: 980, width: 1200, height: 628, uploadedBy: 'Priya Sharma',
    uploadedAt: '2026-09-17T08:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('diwali-offer-banner.png'),
    usedIn: [
      { kind: 'post', status: 'scheduled', title: 'Diwali offer announcement' },
      { kind: 'recycling', status: 'active', title: 'Diwali evergreen offer' },
    ],
  },
  {
    id: 'media-5', type: MEDIA_TYPE.IMAGE, name: 'customer-spotlight.jpg', url: null, folder: 'Campaigns',
    tags: ['customer'], sizeKb: 760, width: 1080, height: 1080, uploadedBy: 'Rahul Verma',
    uploadedAt: '2026-09-12T12:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('customer-spotlight.jpg'),
    usedIn: [{ kind: 'post', status: 'published', title: 'Customer spotlight: Sara Khan' }],
  },
  {
    id: 'media-6', type: MEDIA_TYPE.IMAGE, name: 'logo-variations.png', url: null, folder: 'Brand',
    tags: ['logo', 'brand'], sizeKb: 340, width: 800, height: 400, uploadedBy: 'Nitesh Bhardwaj',
    uploadedAt: '2026-08-28T09:00:00Z', storage: 'external', storageLabel: 'Cloudflare R2',
    publicUrl: 'https://media.gowebkart.in/logo-variations.png',
    usedIn: [
      { kind: 'email', status: 'active', title: 'Password reset requested (email header logo)' },
      { kind: 'post', status: 'published', title: 'We have a new look' },
    ],
  },
  {
    id: 'media-7', type: MEDIA_TYPE.IMAGE, name: 'summer-sale-2026.jpg', url: null, folder: 'Campaigns',
    tags: ['sale'], sizeKb: 1120, width: 1080, height: 1350, uploadedBy: 'Priya Sharma',
    uploadedAt: '2026-05-02T09:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('summer-sale-2026.jpg'),
    usedIn: [{ kind: 'post', status: 'published', title: 'Summer sale is on' }],
  },
  {
    id: 'media-8', type: MEDIA_TYPE.IMAGE, name: 'eid-greeting.jpg', url: null, folder: 'Campaigns',
    tags: ['eid'], sizeKb: 640, width: 1080, height: 1080, uploadedBy: 'Rahul Verma',
    uploadedAt: '2026-04-01T09:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('eid-greeting.jpg'),
    usedIn: [{ kind: 'post', status: 'published', title: 'Eid greetings' }],
  },
  {
    id: 'media-9', type: MEDIA_TYPE.IMAGE, name: 'old-banner-draft.png', url: null, folder: 'Brand',
    tags: [], sizeKb: 2210, width: 1920, height: 1080, uploadedBy: 'Nitesh Bhardwaj',
    uploadedAt: '2026-03-10T09:00:00Z', storage: 'server', storageLabel: 'Server', publicUrl: publicUrl('old-banner-draft.png'),
    usedIn: [],
  },
];

export const mediaFoldersMock = ['All Media', 'Campaigns', 'Brand', 'Product'];

export default mediaMock;
