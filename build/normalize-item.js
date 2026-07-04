function normalizeItem(item, feedId) {
  const raw = item.isoDate || item.pubDate || null;
  let pubDate = null;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      pubDate = d.toISOString().slice(0, 16);
    }
  }
  return {
    title: item.title || '(no title)',
    link: item.link || item.guid || '#',
    pubDate,
    feedId,
  };
}

module.exports = { normalizeItem };
