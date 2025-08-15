// Detects messages that are NOT normal text (attachments, stickers, embeds, or link-only)
export function isNonTextPayload(msg) {
  try {
    const hasAttachments = msg.attachments?.size > 0;
    const hasStickers = msg.stickers?.size > 0;
    const hasEmbeds = Array.isArray(msg.embeds) && msg.embeds.length > 0;

    const content = (msg.content ?? "").trim();

    // Strict link-only (exactly a URL)
    const urlOnly = /^(https?:\/\/\S+)$/i.test(content);

    // Mostly-link (short extra text like "yo https://…")
    const loose = /(https?:\/\/\S+)/i;
    const mostlyLink = loose.test(content) && content.replace(loose, "").trim().length <= 2;

    return hasAttachments || hasStickers || hasEmbeds || urlOnly || mostlyLink;
  } catch {
    return false;
  }
}
