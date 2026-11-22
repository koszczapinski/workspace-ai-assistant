const TITLE_LENGTH = 80;

/** A Conversation's title: its first User message, whitespace collapsed, cut at 80 characters. */
export function conversationTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH);
}
