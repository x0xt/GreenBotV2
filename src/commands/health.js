import { buckets, globalInFlight, globalQueue, breakerOpen, breakerTrippedUntil } from '../features/ai/backpressure.js';

export const data = {
  name: 'health',
  description: 'Displays the current health and queue status of the bot.',
};

export async function execute(msg, args) {
  return msg.reply({
    content: "```json\n" + JSON.stringify({
      globalInFlight,
      globalQueue: globalQueue.length,
      breakerOpen: breakerOpen(),
      breakerTrippedUntil: breakerTrippedUntil > 0 ? new Date(breakerTrippedUntil).toISOString() : 'N/A',
      perUserInFlight: (buckets.get(msg.author.id)?.inFlight ?? 0),
      perUserQueue: (buckets.get(msg.author.id)?.queue.length ?? 0)
    }, null, 2) + "\n```",
    allowedMentions: { parse: [], repliedUser: false }
  });
}
