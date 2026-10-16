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
    return `<section class="widget feed-widget" id="feed-${escapeHtml(config.id)}" aria-labelledby="feed-heading-${escapeHtml(config.id)}">
${header}
  <div class="widget-body">
    <p class="feed-unavailable">feed unavailable</p>
  </div>
</section>`;
  }

  const items = feedData.items
    .map((item) => {
      const safeLink = isSafeUrl(item.link) ? escapeHtml(item.link) : '#';
      const dateEl = item.pubDate
        ? `\n      <time class="feed-item-date" datetime="${escapeHtml(item.pubDate)}">${escapeHtml(item.pubDate)}</time>`
        : '';
      return `    <li class="feed-item">
      <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="feed-item-title">${escapeHtml(item.title)}</a>${dateEl}
    </li>`;
    })
    .join('\n');

  return `<section class="widget feed-widget" id="feed-${escapeHtml(config.id)}" aria-labelledby="feed-heading-${escapeHtml(config.id)}">
${header}
  <ul class="widget-body feed-list">
${items}
  </ul>
</section>`;
}

module.exports = { render };
