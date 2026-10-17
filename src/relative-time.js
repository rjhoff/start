(function (root) {
  'use strict';

  function parseUtcTimestamp(value) {
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatRelativeTime(value, now = Date.now()) {
    const date = parseUtcTimestamp(value);
    if (!date || !Number.isFinite(now)) return null;
    const age = Math.max(0, now - date.getTime());
    if (age < 60_000) return 'now';
    if (age < 3_600_000) return `${Math.floor(age / 60_000)}m`;
    if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h`;
    if (age < 604_800_000) return `${Math.floor(age / 86_400_000)}d`;
    return `${Math.floor(age / 604_800_000)}w`;
  }

  const api = { parseUtcTimestamp, formatRelativeTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RssTime = api;
})(typeof window === 'undefined' ? globalThis : window);
