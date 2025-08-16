// True if the message is a Discord "reply" to one of the bot's messages.
export async function isReplyToBot(msg) {
  try {
    const ref = msg.reference;
    if (!ref?.messageId) return false;
    const replied = await msg.channel.messages.fetch(ref.messageId).catch(() => null);
    return Boolean(replied?.author?.bot);
  } catch {
    return false;
  }
}
