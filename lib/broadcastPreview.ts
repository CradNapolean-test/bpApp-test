// The Scheduled & sent list shows the first 3 lines of each broadcast (MS14). Blank lines between paragraphs used up those lines, so
// "Hey Team," and two gaps were all that showed. The preview leaves them out; the message itself is unchanged.
export function broadcastPreview(message: string): string {
  return message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n');
}
