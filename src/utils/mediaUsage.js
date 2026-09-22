// Where a media file is used decides whether deleting it is safe.
//   - A PUBLISHED post is safe: Instagram, Facebook, X etc. keep their own copy
//     of the file, so removing ours does not touch the live post.
//   - Everything else still needs the file from us and would break: a scheduled
//     post (fetches it at publish time), a draft, a recycling item (re-posted
//     later) and an email template (loads it by URL every time it is opened).

const KIND_LABELS = { post: 'post', recycling: 'recycling item', email: 'email' };

export function summarizeUsage(item) {
  const usedIn = item.usedIn || [];
  const published = usedIn.filter((use) => use.kind === 'post' && use.status === 'published');
  const atRisk = usedIn.filter((use) => !(use.kind === 'post' && use.status === 'published'));
  return { published, atRisk, total: usedIn.length };
}

export function describeUse(use) {
  if (use.kind === 'post') return `${use.status === 'published' ? 'Published' : use.status === 'scheduled' ? 'Scheduled' : 'Draft'} post`;
  return `${KIND_LABELS[use.kind] || use.kind}`.replace(/^./, (letter) => letter.toUpperCase());
}

// "3 scheduled posts, 1 recycling item, 1 email"
export function describeAtRisk(atRisk) {
  const groups = new Map();
  atRisk.forEach((use) => {
    const label = use.kind === 'post' ? `${use.status} post` : KIND_LABELS[use.kind];
    groups.set(label, (groups.get(label) || 0) + 1);
  });
  return [...groups.entries()].map(([label, count]) => `${count} ${label}${count > 1 ? 's' : ''}`).join(', ');
}

export function isSafeToBulkDelete(item) {
  return summarizeUsage(item).atRisk.length === 0;
}
