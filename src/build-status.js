(function () {
  'use strict';

  const POLL_MS = 5 * 60_000;
  const FETCH_TIMEOUT_MS = 8_000;

  function buildAge(builtAt, now) {
    const age = now - Date.parse(builtAt);
    if (!Number.isFinite(age)) return 'unknown';
    if (age < 60_000) return 'just now';
    const minutes = Math.floor(age / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function scheduleState(now, builtAt, cron) {
    if (cron !== '0 * * * *' || !Number.isFinite(now) || !Number.isFinite(Date.parse(builtAt))) return null;
    const boundary = Math.floor(now / 3_600_000) * 3_600_000;
    const next = boundary + 3_600_000;
    const seconds = Math.max(0, Math.ceil((next - now) / 1000));
    const countdown = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    return { next: new Date(next).toISOString(), awaiting: boundary > Date.parse(builtAt), countdown };
  }

  function publishedCandidate(manifest, loaded) {
    if (!manifest || typeof manifest.version !== 'string' || !/^[A-Za-z0-9:.-]+$/.test(manifest.version) ||
      typeof manifest.builtAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(manifest.builtAt) ||
      !Number.isFinite(Date.parse(manifest.builtAt)) || new Date(manifest.builtAt).toISOString() !== manifest.builtAt ||
      manifest.version === loaded.version) return false;
    return Date.parse(manifest.builtAt) >= Date.parse(loaded.builtAt);
  }

  function verifiedVersion(manifest, htmlVersion, htmlBuiltAt, loaded) {
    return publishedCandidate(manifest, loaded) && manifest.version === htmlVersion &&
      manifest.builtAt === htmlBuiltAt;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildAge, scheduleState, publishedCandidate, verifiedVersion };
  }
  if (typeof document === 'undefined') return;

  let metadata;
  try { metadata = JSON.parse(document.getElementById('build-metadata')?.textContent || ''); }
  catch { return; }
  if (!metadata?.version || !Array.isArray(metadata.feeds)) return;

  const status = document.querySelector('.status-bar');
  const builtTime = document.getElementById('built-at-time');
  const countdown = document.getElementById('next-countdown');
  const nextLabel = document.getElementById('status-next');
  const updateLabel = document.getElementById('status-update');
  const refresh = document.getElementById('status-refresh');
  const detailsButton = document.getElementById('status-details-trigger');
  const details = document.getElementById('build-details');
  const detailsClose = document.getElementById('build-details-close');
  let restoreTarget = null;
  let checking = false;
  let checkNumber = 0;
  let updateAvailable = false;

  document.getElementById('status-static').hidden = true;
  detailsButton.hidden = false;
  nextLabel.hidden = false;
  status.classList.toggle('is-degraded', metadata.successCount < metadata.feedCount);
  document.getElementById('details-version').textContent = metadata.version;
  document.getElementById('details-feeds').textContent = `RSS ${metadata.successCount}/${metadata.feedCount}`;
  document.getElementById('details-failed').textContent = metadata.feeds.filter(feed => !feed.ok).map(feed => feed.name).join(', ') || 'None';
  document.getElementById('details-schedule').textContent = `${metadata.schedule} UTC (expected, not guaranteed)`;

  function tick() {
    const now = Date.now();
    builtTime.textContent = buildAge(metadata.builtAt, now);
    const schedule = scheduleState(now, metadata.builtAt, metadata.schedule);
    if (!schedule) {
      nextLabel.hidden = true;
      document.getElementById('details-next').textContent = 'Unavailable';
      return;
    }
    nextLabel.firstChild.textContent = schedule.awaiting ? 'AWAITING UPDATE' : 'NEXT ';
    countdown.textContent = schedule.awaiting ? '' : schedule.countdown;
    document.getElementById('details-next').textContent = `${schedule.next} (expected); ${schedule.awaiting ? 'awaiting publication' : 'upcoming'}`;
  }
  tick();
  setInterval(tick, 1000);

  function openDetails() {
    if (details.open) return;
    restoreTarget = document.activeElement;
    details.showModal();
    detailsClose.focus();
  }
  detailsButton.addEventListener('click', openDetails);
  detailsClose.addEventListener('click', () => details.close());
  details.addEventListener('close', () => {
    if (restoreTarget?.isConnected && restoreTarget.getClientRects().length) restoreTarget.focus({ preventScroll: true });
    else detailsButton.focus({ preventScroll: true });
    restoreTarget = null;
  });

  function refreshPublished() {
    if (!updateAvailable) return;
    const target = new URL('index.html', document.baseURI);
    target.searchParams.set('refresh', String(Date.now()));
    location.assign(target.href);
  }
  refresh.addEventListener('click', refreshPublished);
  document.addEventListener('keydown', event => {
    if (!updateAvailable || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat ||
      event.key?.toLowerCase() !== 'r' || document.querySelector('dialog[open]') ||
      event.target.matches('input, textarea, select') || event.target.isContentEditable) return;
    event.preventDefault();
    refreshPublished();
  });

  function cacheSafeUrl(name) {
    const url = new URL(name, document.baseURI);
    url.searchParams.set('check', `${Date.now()}-${++checkNumber}`);
    return url;
  }

  async function checkPublished() {
    if (checking || document.hidden || !navigator.onLine) return;
    checking = true;
    try {
      const options = { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
      const manifestResponse = await fetch(cacheSafeUrl('version.json'), options);
      if (!manifestResponse.ok) return;
      const manifest = await manifestResponse.json();
      if (!publishedCandidate(manifest, metadata)) return;
      const htmlResponse = await fetch(cacheSafeUrl('index.html'), options);
      if (!htmlResponse.ok) return;
      const html = new DOMParser().parseFromString(await htmlResponse.text(), 'text/html');
      const htmlVersion = html.querySelector('meta[name="dashboard-version"]')?.getAttribute('content');
      const htmlBuiltAt = html.body?.getAttribute('data-built-at');
      if (!verifiedVersion(manifest, htmlVersion, htmlBuiltAt, metadata)) return;
      if (updateAvailable) return;
      updateAvailable = true;
      status.classList.add('has-update');
      updateLabel.hidden = false;
      refresh.hidden = false;
      document.getElementById('shortcut-refresh').hidden = false;
      document.getElementById('details-update').textContent = 'Available; refresh manually';
    } catch { /* Network and partial-publication failures leave loaded content intact. */ }
    finally { checking = false; }
  }

  checkPublished();
  setInterval(checkPublished, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); checkPublished(); } });
  window.addEventListener('online', checkPublished);
})();
