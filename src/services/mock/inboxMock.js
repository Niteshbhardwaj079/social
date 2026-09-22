import { CONVERSATION_STATUS } from '../../config/constants';
import { PLATFORM_KEYS } from '../../config/platforms';

const inboxMock = [
  {
    id: 'conv-1',
    customerName: 'Amit Kapoor',
    platform: PLATFORM_KEYS.FACEBOOK,
    status: CONVERSATION_STATUS.OPEN,
    isUnread: true,
    lastMessage: 'Hi, do you ship internationally?',
    lastMessageAt: '2026-09-18T06:10:00Z',
    assignedTo: 'Priya Sharma',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Hi, do you ship internationally?', time: '2026-09-18T06:10:00Z' },
    ],
    customerInfo: { location: 'Delhi, India', joined: '2024-02-10', totalOrders: 3 },
    // What the platform API returns for this person. The Inbox decides what to show
    // from the client's API plan — this object is the full answer, not the visible part.
    customerProfile: { userId: '6103477215', followers: 0 },
  },
  {
    id: 'conv-2',
    customerName: 'Sara Khan',
    platform: PLATFORM_KEYS.INSTAGRAM,
    status: CONVERSATION_STATUS.PENDING,
    isUnread: true,
    lastMessage: 'Loved the new collection! When does it restock?',
    lastMessageAt: '2026-09-18T05:20:00Z',
    assignedTo: null,
    messages: [
      { id: 'm1', sender: 'customer', text: 'Loved the new collection! When does it restock?', time: '2026-09-18T05:20:00Z' },
    ],
    customerInfo: { location: 'Mumbai, India', joined: '2023-11-02', totalOrders: 7 },
    customerProfile: {
      handle: '@sara.styles',
      userId: '17841405309211844',
      followers: 12840,
      verified: false,
      followsYou: true,
      youFollow: false,
    },
  },
  {
    id: 'conv-3',
    customerName: 'John Mathews',
    platform: PLATFORM_KEYS.X,
    status: CONVERSATION_STATUS.CLOSED,
    isUnread: false,
    lastMessage: 'Thanks for the quick help!',
    lastMessageAt: '2026-09-17T15:40:00Z',
    assignedTo: 'Rahul Verma',
    messages: [
      { id: 'm1', sender: 'customer', text: 'My order is delayed, can you check?', time: '2026-09-17T14:00:00Z' },
      { id: 'm2', sender: 'agent', text: 'Sure, checking that for you now.', time: '2026-09-17T14:10:00Z' },
      { id: 'm3', sender: 'customer', text: 'Thanks for the quick help!', time: '2026-09-17T15:40:00Z' },
    ],
    customerInfo: { location: 'London, UK', joined: '2022-06-18', totalOrders: 12 },
    customerProfile: {
      handle: '@john_mathews',
      userId: '1459823706114220032',
      followers: 3120,
      following: 412,
      posts: 8931,
      verified: true,
      joinedAt: '2022-06-18',
      location: 'London, UK',
      bio: 'Product designer. Coffee, cameras and open source.',
      profileUrl: 'https://x.com/john_mathews',
    },
  },
  {
    id: 'conv-4',
    customerName: 'Neha Gupta',
    platform: PLATFORM_KEYS.LINKEDIN,
    status: CONVERSATION_STATUS.OPEN,
    isUnread: false,
    lastMessage: 'Can we schedule a demo call this week?',
    lastMessageAt: '2026-09-17T10:15:00Z',
    assignedTo: 'Nitesh Bhardwaj',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Can we schedule a demo call this week?', time: '2026-09-17T10:15:00Z' },
    ],
    customerInfo: { location: 'Bengaluru, India', joined: '2025-01-20', totalOrders: 0 },
    customerProfile: { userId: 'AbC12xYz9Q' },
  },
];

export default inboxMock;
