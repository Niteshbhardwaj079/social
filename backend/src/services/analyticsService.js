import { query } from '../db/pool.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Called wherever a platform's follower count is actually read (connect, Sync now, the background check). */
export async function recordFollowerSnapshot(platform, followers) {
  if (!Number.isFinite(followers)) return;
  await query('INSERT INTO account_metrics_history (platform, followers) VALUES ($1, $2)', [platform, followers]);
}

/**
 * The total followers across every platform, one point per day, for the last `days` days — built by
 * carrying each platform's last known count forward into days it wasn't re-checked (a 6-hourly check
 * does not mean a snapshot lands on every single day). Real numbers only: a platform with no snapshot
 * yet (never connected, or connected after the window started) contributes nothing until it has one.
 */
export async function getFollowerHistory(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  // Padded further back so the very first requested day can still carry forward a real prior reading
  // instead of showing a dip to zero on day one.
  const rows = (
    await query('SELECT platform, followers, recorded_at FROM account_metrics_history WHERE recorded_at >= $1 ORDER BY recorded_at ASC', [
      new Date(since.getTime() - 30 * DAY_MS),
    ])
  ).rows;

  const byPlatform = new Map();
  for (const row of rows) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform).push(row);
  }

  const series = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * DAY_MS);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    let total = 0;
    let any = false;
    for (const snapshots of byPlatform.values()) {
      const latest = [...snapshots].reverse().find((row) => new Date(row.recorded_at) <= dayEnd);
      if (latest) {
        total += latest.followers;
        any = true;
      }
    }
    series.push({ date: dayEnd.toISOString().slice(0, 10), followers: any ? total : 0 });
  }
  return series;
}

/** Today's total vs `daysAgo` days ago, as a percentage change (null if there is nothing to compare against). */
export async function getFollowerDelta(daysAgo) {
  const series = await getFollowerHistory(daysAgo + 1);
  const first = series[0]?.followers ?? 0;
  const last = series[series.length - 1]?.followers ?? 0;
  if (!first) return { current: last, delta: null };
  return { current: last, delta: Number((((last - first) / first) * 100).toFixed(1)) };
}
