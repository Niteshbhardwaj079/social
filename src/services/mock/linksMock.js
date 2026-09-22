function buildClickHistory(seedValues) {
  const today = new Date('2026-09-19T00:00:00Z');
  return seedValues.map((clicks, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (seedValues.length - 1 - index));
    return { date: date.toISOString().slice(0, 10), clicks };
  });
}

const linksMock = [
  {
    id: 'link-1',
    slug: 'diwali25',
    destinationUrl: 'https://gowebkart.in/diwali-offer',
    label: 'Diwali Festive Offer',
    clicks: 482,
    createdAt: '2026-09-10T08:00:00Z',
    createdBy: 'Nitesh Bhardwaj',
    clickHistory: buildClickHistory([12, 18, 24, 30, 45, 52, 61, 58, 40, 35, 44, 39, 24, 20]),
  },
  {
    id: 'link-2',
    slug: 'new-dashboard',
    destinationUrl: 'https://gowebkart.in/blog/new-dashboard-launch',
    label: 'New Dashboard Launch',
    clicks: 216,
    createdAt: '2026-09-12T10:30:00Z',
    createdBy: 'Priya Sharma',
    clickHistory: buildClickHistory([5, 8, 14, 22, 28, 25, 20, 18, 22, 26, 19, 15, 10, 8]),
  },
  {
    id: 'link-3',
    slug: 'grow-2026',
    destinationUrl: 'https://gowebkart.in/guides/grow-your-brand-2026',
    label: '5 Tips Guide',
    clicks: 96,
    createdAt: '2026-09-15T12:00:00Z',
    createdBy: 'Priya Sharma',
    clickHistory: buildClickHistory([0, 2, 4, 8, 12, 15, 18, 14, 10, 8, 6, 4, 3, 2]),
  },
];

export default linksMock;
