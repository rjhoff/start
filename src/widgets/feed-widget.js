function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url) {
  return /^https?:\/\//i.test(url) || url === '#';
}

function render(feedData, config) {
  const hasItems = feedData.items && feedData.items.length > 0;

  const header = `  <div class="widget-header">
    <h3 class="widget-title" id="feed-heading-${escapeHtml(config.id)}">${escapeHtml(config.title)}</h3>
    ${config.category ? `<span class="widget-category">${escapeHtml(config.category)}</span>` : ''}
  </div>`;

  if (feedData.error || !hasItems) {
    const empty = !feedData.error;
    return `<section class="widget feed-widget" id="feed-${escapeHtml(config.id)}" aria-labelledby="feed-heading-${escapeHtml(config.id)}" tabindex="-1">
${header}
  <div class="widget-body">
    <p class="${empty ? 'feed-empty' : 'feed-unavailable'}">${empty ? 'No headlines available' : 'feed unavailable'}</p>
  </div>
</section>`;
  }

  const items = feedData.items
    .map((item) => {
      const safeLink = isSafeUrl(item.link) ? escapeHtml(item.link) : '#';
      const date = parseUtcTimestamp(item.pubDate);
      const utc = date?.toISOString();
      const exact = utc ? `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC` : null;
      const fallback = utc ? new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      }).format(date) : null;
      const dateEl = utc
        ? `\n      <time class="feed-item-date" datetime="${escapeHtml(utc)}" title="${escapeHtml(exact)}" aria-label="${escapeHtml(exact)}">${escapeHtml(fallback)}</time>`
        : '';
      return `    <li class="feed-item">
      <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="feed-item-title">${escapeHtml(item.title)}</a>${dateEl}
    </li>`;
    })
    .join('\n');

  return `<section class="widget feed-widget" id="feed-${escapeHtml(config.id)}" aria-labelledby="feed-heading-${escapeHtml(config.id)}" tabindex="-1">
${header}
  <ul class="widget-body feed-list">
${items}
  </ul>
</section>`;
}

module.exports = { render };
const { parseUtcTimestamp } = require('../relative-time.js');
