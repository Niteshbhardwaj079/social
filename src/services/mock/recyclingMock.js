import { PLATFORM_KEYS } from '../../config/platforms';

const recyclingMock = [
  {
    id: 'recycle-1',
    postId: 'post-8',
    content: "Thank you for 25,000 followers! Here's to the next milestone.",
    platforms: [PLATFORM_KEYS.INSTAGRAM, PLATFORM_KEYS.FACEBOOK],
    intervalDays: 30,
    isActive: true,
    lastRunAt: '2026-09-12T09:00:00Z',
    nextRunAt: '2026-10-12T09:00:00Z',
    totalReposts: 3,
  },
  {
    id: 'recycle-2',
    postId: 'post-2',
    content: 'Behind the scenes at Gowebkart — meet the team building Social.',
    platforms: [PLATFORM_KEYS.INSTAGRAM, PLATFORM_KEYS.THREADS],
    intervalDays: 60,
    isActive: true,
    lastRunAt: '2026-08-16T13:00:00Z',
    nextRunAt: '2026-10-15T13:00:00Z',
    totalReposts: 1,
  },
  {
    id: 'recycle-3',
    postId: 'post-6',
    content: 'Client spotlight: how ABC Retail grew engagement 3x using Social.',
    platforms: [PLATFORM_KEYS.LINKEDIN_COMPANY, PLATFORM_KEYS.X],
    intervalDays: 90,
    isActive: false,
    lastRunAt: '2026-06-14T12:00:00Z',
    nextRunAt: '2026-09-14T12:00:00Z',
    totalReposts: 2,
  },
];

export default recyclingMock;
