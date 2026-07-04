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
    <span class="widget-title">${escapeHtml(config.title)}</span>
    ${config.category ? `<span class="widget-category">${escapeHtml(config.category)}</span>` : ''}
  </div>`;

  if (feedData.error || !hasItems) {
    return `<div class="widget feed-widget" id="feed-${escapeHtml(config.id)}">
${header}
  <div class="widget-body">
    <p class="feed-unavailable">feed unavailable</p>
  </div>
</div>`;
  }

  const items = feedData.items
    .map((item) => {
      const safeLink = isSafeUrl(item.link) ? escapeHtml(item.link) : '#';
      const dateEl = item.pubDate
        ? `\n      <time class="feed-item-date" datetime="${item.pubDate}">${item.pubDate}</time>`
        : '';
      return `    <li class="feed-item">
      <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="feed-item-title">${escapeHtml(item.title)}</a>${dateEl}
    </li>`;
    })
    .join('\n');

  return `<div class="widget feed-widget" id="feed-${escapeHtml(config.id)}">
${header}
  <ul class="widget-body feed-list">
${items}
  </ul>
</div>`;
}

module.exports = { render };
