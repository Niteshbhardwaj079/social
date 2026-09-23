-- Phase 7/9 hardening: an honest "the last background refresh for this ad failed" signal. Before this,
-- ads.last_synced_at was stamped on every attempt regardless of outcome (see adsService.js's
-- refreshOneAd), so a client had no way to tell "up to date" apart from "Meta kept failing, but we kept
-- trying and stamping the time anyway". NULL means the last attempt succeeded (or none has run yet);
-- set means the last attempt failed and the real error Meta (or the network) gave, so the client can
-- show real numbers as possibly stale without inventing a fake metric to explain why.
ALTER TABLE ads ADD COLUMN last_sync_error text;
