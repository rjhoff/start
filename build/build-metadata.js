const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const WORKFLOW_PATH = path.join(__dirname, '..', '.github', 'workflows', 'build.yml');

function scheduledCron(workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8')) {
  const matches = [...workflow.matchAll(/^\s*- cron:\s*['"]([^'"]+)['"]/gm)];
  if (matches.length !== 1 || matches[0][1] !== '0 * * * *') {
    throw new Error('Expected one hourly, on-the-hour workflow schedule');
  }
  return matches[0][1];
}

function createBuildMetadata({ feeds, feedData, builtAt = new Date().toISOString(),
  version, runId = process.env.GITHUB_RUN_ID, runAttempt = process.env.GITHUB_RUN_ATTEMPT,
  cron = scheduledCron() }) {
  const timestamp = new Date(builtAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid build timestamp');
  const iso = timestamp.toISOString();
  const identity = version || `${iso}-${runId && /^\d+$/.test(runId) ? `${runId}-${/^\d+$/.test(runAttempt || '') ? runAttempt : '1'}` : crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9:.-]+$/.test(identity)) throw new Error('Invalid build identifier');
  const sources = feeds.map(feed => ({
    id: feed.id,
    name: feed.title,
    ok: Boolean(feedData[feed.id] && !feedData[feed.id].error),
  }));
  return {
    version: identity,
    builtAt: iso,
    schedule: cron,
    feedCount: sources.length,
    successCount: sources.filter(source => source.ok).length,
    feeds: sources,
  };
}

module.exports = { scheduledCron, createBuildMetadata };
