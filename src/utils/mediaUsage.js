// Where a media file is used decides whether deleting it is safe.
//   - A PUBLISHED post is safe: Instagram, Facebook, X etc. keep their own copy
//     of the file, so removing ours does not touch the live post.
//   - Everything else still needs the file from us and would break: a scheduled
//     post (fetches it at publish time), a draft, a recycling item (re-posted
//     later) and an email template (loads it by URL every time it is opened).

export function summarizeUsage(item) {
  const usedIn = item.usedIn || [];
  const published = usedIn.filter((use) => use.kind === 'post' && use.status === 'published');
  const atRisk = usedIn.filter((use) => !(use.kind === 'post' && use.status === 'published'));
  return { published, atRisk, total: usedIn.length };
}

/** `t` is the i18n function — every caller already has one in scope via useI18n(). */
export function describeUse(use, t) {
  if (use.kind === 'post') {
    if (use.status === 'published') return t('media.usage.publishedPost');
    if (use.status === 'scheduled') return t('media.usage.scheduledPost');
    return t('media.usage.draftPost');
  }
  if (use.kind === 'recycling') return t('media.usage.recyclingItem');
  return t('media.usage.email');
}

// "3 scheduled posts, 1 recycling item, 1 email"
export function describeAtRisk(atRisk, t) {
  const groups = new Map();
  atRisk.forEach((use) => {
    const key = use.kind === 'post' ? `post:${use.status}` : use.kind;
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  return [...groups.entries()]
    .map(([key, count]) => {
      if (key.startsWith('post:')) {
        const status = key.slice(5);
        return t(count === 1 ? 'media.usage.postUsageOne' : 'media.usage.postUsageOther', { count, status: t(`common.status.${status}`) });
      }
      if (key === 'recycling') return t(count === 1 ? 'media.usage.recyclingUsageOne' : 'media.usage.recyclingUsageOther', { count });
      return t(count === 1 ? 'media.usage.emailUsageOne' : 'media.usage.emailUsageOther', { count });
    })
    .join(', ');
}

export function isSafeToBulkDelete(item) {
  return summarizeUsage(item).atRisk.length === 0;
}
