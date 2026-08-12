import { claimGlobalPublishGate, releaseGlobalPublishGate } from '../db/publishSafety.js';
import { config } from '../config.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Serializes every outbound channel publication (normal posts and stickers).
 * The lease protects against a second process; the release delay adds a human-safe gap.
 */
export async function withGlobalPublishGate(work) {
  const token = await claimGlobalPublishGate({
    // A media upload can legitimately take longer than a minute.  The lease
    // must outlive it, otherwise a second process could overlap a publish.
    leaseSeconds: Math.max(300, config.canalbot.globalSendLeaseSeconds, config.canalbot.globalSendDelaySeconds + 45)
  });
  if (!token) return { acquired: false, value: null };
  try {
    return { acquired: true, value: await work() };
  } finally {
    await sleep(Math.max(0, config.canalbot.globalSendDelaySeconds) * 1000);
    await releaseGlobalPublishGate(token);
  }
}
