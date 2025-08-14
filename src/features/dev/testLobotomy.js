import { notifyTimeout } from '../../shared/notifyTimeout.js';

export default {
  name: 'dev-test-lobotomy',
  on: 'messageCreate',
  async run(msg) {
    if (msg.author.bot) return;
    if (!msg.content?.startsWith('!testlobotomy')) return;
    await notifyTimeout(msg.channel, '🪓 test fire — this should animate.');
  }
};
