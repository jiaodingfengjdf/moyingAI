export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TextNode {
  type: 'text';
  text?: string;
  marks?: Mark[];
}

export interface HardBreakNode {
  type: 'hardBreak';
}

export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
}

export type Node = BlockNode | TextNode | HardBreakNode;

export interface Doc {
  type: 'doc';
  content?: Node[];
}

function children(node: Node): Node[] {
  return (node as BlockNode).content ?? [];
}

function inlineToText(node: Node): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'text') {
    const textNode = node as TextNode;
    let text = textNode.text ?? '';
    for (const mark of textNode.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'code') text = '`' + text + '`';
    }
    return text;
  }
  return '';
}

function blockToString(node: Node): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `${'#'.repeat(level)} ${children(node).map(inlineToText).join('')}`;
    }
    case 'paragraph':
      return children(node).map(inlineToText).join('');
    case 'horizontalRule':
      return '---';
    case 'blockquote':
      return `> ${children(node).flatMap((child) => children(child).map(inlineToText)).join('')}`;
    case 'codeBlock':
      return '```\n' + children(node).map((n) => (n.type === 'text' ? ((n as TextNode).text ?? '') : '')).join('\n') + '\n```';
    case 'bulletList':
      return children(node).map((item) => `- ${children(item).map(inlineToText).join('')}`).join('\n');
    case 'orderedList':
      return children(node).map((item, i) => `${i + 1}. ${children(item).map(inlineToText).join('')}`).join('\n');
    default:
      return '';
  }
}

export function serializeDoc(doc: Doc): string {
  return (doc.content ?? []).map(blockToString).filter((s) => s !== '').join('\n\n');
}

function parseInline(text: string): Node[] {
  const nodes: Node[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  const pushText = (t: string) => {
    if (t) nodes.push({ type: 'text', text: t });
  };
  let last = 0;
  for (const m of text.matchAll(regex)) {
    const index = m.index ?? 0;
    pushText(text.slice(last, index));
    if (m[1] !== undefined) nodes.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] });
    else if (m[3] !== undefined) nodes.push({ type: 'text', text: m[4], marks: [{ type: 'italic' }] });
    else nodes.push({ type: 'text', text: m[6], marks: [{ type: 'code' }] });
    last = index + m[0].length;
  }
  pushText(text.slice(last));
  return nodes;
}

function paragraphFromLines(lines: string[]): BlockNode {
  const content: Node[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    content.push(...parseInline(line));
  });
  return { type: 'paragraph', content };
}

export function parseDoc(md: string): Doc {
  const normalized = md.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { type: 'doc', content: [] };
  const content: Node[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^#{1,6}\s+/.test(lines[0])) {
      const level = lines[0].match(/^#{1,6}\s+/)?.[0].trim().length ?? 1;
      content.push({ type: 'heading', attrs: { level }, content: parseInline(lines[0].replace(/^#{1,6}\s+/, '')) });
    } else if (lines.every((l) => /^-\s+/.test(l))) {
      content.push({ type: 'bulletList', content: lines.map((l) => ({ type: 'listItem', content: parseInline(l.replace(/^-\s+/, '')) })) });
    } else if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      content.push({ type: 'orderedList', content: lines.map((l) => ({ type: 'listItem', content: parseInline(l.replace(/^\d+\.\s+/, '')) })) });
    } else if (lines[0] === '---') {
      content.push({ type: 'horizontalRule' });
    } else if (lines[0].startsWith('```')) {
      content.push({ type: 'codeBlock', content: [{ type: 'text', text: lines.slice(1, -1).join('\n') }] });
    } else if (lines[0].startsWith('> ')) {
      content.push({ type: 'blockquote', content: [paragraphFromLines(lines.map((l) => l.replace(/^>\s?/, '')))] });
    } else {
      content.push(paragraphFromLines(lines));
    }
  }
  return { type: 'doc', content };
}
