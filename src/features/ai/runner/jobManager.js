// src/features/ai/runner/jobManager.js

const inflight = new Map(); // K: userId, V: { child, startedAt, query }

/** Checks if a user has a job running. */
export function hasJob(userId) {
  return inflight.has(userId);
}

/** Gets the current job for a user. */
export function getJob(userId) {
  return inflight.get(userId) || null;
}

/** Returns the number of seconds since a job was started. */
export function secondsSince(userId) {
    const job = getJob(userId);
    if (!job) return 0;
    return Math.floor((Date.now() - job.startedAt) / 1000);
}

/**
 * Stores the child process and metadata for a new job.
 * @param {string} userId
 * @param {import('child_process').ChildProcess} child
 * @param {string} query
 */
export function startJob(userId, child, query) {
  if (hasJob(userId)) {
    console.warn(`User ${userId} already has a job, but startJob was called again.`);
    cancelJob(userId);
  }
  inflight.set(userId, { child, startedAt: Date.now(), query });
}

/**
 * Forcefully terminates a user's running job and removes it from tracking.
 * @returns {boolean} True if a job was found and terminated, otherwise false.
 */
export function cancelJob(userId) {
  const job = getJob(userId);
  if (!job) {
    return false;
  }
  try {
    job.child.kill('SIGKILL');
  } catch (error) {
    console.error(`Failed to kill process for user ${userId}:`, error);
  }
  inflight.delete(userId);
  return true;
}

/** Removes a job from tracking without killing the process (for jobs that finish normally). */
export function clearJob(userId) {
    inflight.delete(userId);
}
