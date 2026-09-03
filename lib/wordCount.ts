export function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}
