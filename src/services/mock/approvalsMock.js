import { APPROVAL_STATUS } from '../../config/constants';
import { PLATFORM_KEYS } from '../../config/platforms';

const approvalsMock = [
  {
    id: 'appr-1',
    postContent: '5 tips to grow your brand across every social channel in 2026.',
    platforms: [PLATFORM_KEYS.LINKEDIN, PLATFORM_KEYS.X],
    submittedBy: 'Priya Sharma',
    submittedAt: '2026-09-17T14:20:00Z',
    status: APPROVAL_STATUS.SUBMITTED,
    comments: [],
  },
  {
    id: 'appr-2',
    postContent: 'Client spotlight: how ABC Retail grew engagement 3x using Social.',
    platforms: [PLATFORM_KEYS.LINKEDIN_COMPANY, PLATFORM_KEYS.X],
    submittedBy: 'Rahul Verma',
    submittedAt: '2026-09-14T11:00:00Z',
    status: APPROVAL_STATUS.REJECTED,
    comments: [
      { id: 'c1', author: 'Nitesh Bhardwaj', text: 'Please add the client logo and get sign-off from ABC Retail before resubmitting.', time: '2026-09-14T12:00:00Z' },
    ],
  },
  {
    id: 'appr-3',
    postContent: 'Draft: Diwali offer announcement — final copy pending review.',
    platforms: [PLATFORM_KEYS.FACEBOOK, PLATFORM_KEYS.INSTAGRAM],
    submittedBy: 'Nitesh Bhardwaj',
    submittedAt: '2026-09-16T09:00:00Z',
    status: APPROVAL_STATUS.UNDER_REVIEW,
    comments: [
      { id: 'c1', author: 'Priya Sharma', text: 'Can we make the CTA stronger?', time: '2026-09-16T10:00:00Z' },
    ],
  },
  {
    id: 'appr-4',
    postContent: 'Our YouTube walkthrough of the new Post Composer is live now.',
    platforms: [PLATFORM_KEYS.YOUTUBE],
    submittedBy: 'Rahul Verma',
    submittedAt: '2026-09-15T08:00:00Z',
    status: APPROVAL_STATUS.APPROVED,
    comments: [],
  },
];

export default approvalsMock;
