import {
  PER_USER_MAX_INFLIGHT,
  PER_USER_MAX_QUEUE,
  GLOBAL_MAX_INFLIGHT,
  GLOBAL_MAX_QUEUE,
  BREAKER_WINDOW_MS,
  BREAKER_FAILS,
  BREAKER_COOLDOWN_MS
} from '../../shared/constants.js';

// These variables are exported so the !gb health command can read them.
export let globalInFlight = 0;
export let breakerTrippedUntil = 0;
export const buckets = new Map();
export const globalQueue = [];
const recentFailures = [];

export function recordFailure() {
  const now = Date.now();
  recentFailures.push(now);
  while (recentFailures.length > 0 && (now - recentFailures[0]) > BREAKER_WINDOW_MS) {
    recentFailures.shift();
  }
  if (recentFailures.length >= BREAKER_FAILS) {
    const jitter = Math.floor(Math.random() * 4000);
    breakerTrippedUntil = now + BREAKER_COOLDOWN_MS + jitter;
    console.warn(`CIRCUIT BREAKER TRIPPED for ${breakerTrippedUntil - now}ms`);
  }
}

export function breakerOpen() {
  return Date.now() < breakerTrippedUntil;
}

export function schedule(userId, taskFn) {
  return new Promise((resolve, reject) => {
    if (breakerOpen()) {
      console.warn('breaker_open: rejecting request (cooling down)');
      return reject(new Error('breaker_open'));
    }
    const b = buckets.get(userId) ?? { inFlight: 0, queue: [] };
    buckets.set(userId, b);

    if (b.inFlight >= PER_USER_MAX_INFLIGHT) {
      if (b.queue.length >= PER_USER_MAX_QUEUE) return reject(new Error('user_queue_full'));
      b.queue.push(() => runUserTask(userId, b, taskFn).then(resolve, reject));
      return;
    }
    runUserTask(userId, b, taskFn).then(resolve, reject);
  });
}

function runUserTask(userId, b, taskFn) {
  return new Promise((resolve, reject) => {
    if (globalInFlight >= GLOBAL_MAX_INFLIGHT) {
      if (globalQueue.length >= GLOBAL_MAX_QUEUE) return reject(new Error('global_queue_full'));
      globalQueue.push({ run: () => runUserTask(userId, b, taskFn).then(resolve, reject), reject });
      return;
    }
    globalInFlight++;
    b.inFlight++;
    taskFn().then(resolve, reject).finally(() => {
      b.inFlight--;
      globalInFlight--;
      const nextUser = b.queue.shift();
      if (nextUser) {
        if (globalInFlight >= GLOBAL_MAX_INFLIGHT) {
          if (globalQueue.length < GLOBAL_MAX_QUEUE) globalQueue.push({ run: nextUser, reject: () => {} });
        } else {
          nextUser();
        }
      } else {
        const g = globalQueue.shift();
        if (g) g.run();
      }
    });
  });
}
