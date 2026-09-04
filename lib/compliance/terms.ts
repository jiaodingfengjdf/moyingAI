export interface ComplianceHit {
  category: string;
  term: string;
  count: number;
  snippets: string[];
}

export const TERM_LIBRARY: Array<{ category: string; terms: string[] }> = [
  { category: '涉政', terms: ['集会示威', '游行请愿', '颠覆宣传'] },
  { category: '涉黄', terms: ['成人影片', '色情服务', '露骨描写示范'] },
  { category: '暴力血腥', terms: ['分尸现场', '虐杀细节', '自残教程'] },
  { category: '侵权线索', terms: ['抄袭门实锤', '洗稿服务'] },
];

export function scanText(text: string): ComplianceHit[] {
  const hits: ComplianceHit[] = [];
  for (const group of TERM_LIBRARY) {
    for (const term of group.terms) {
      let idx = 0;
      const positions: number[] = [];
      while (true) {
        const found = text.indexOf(term, idx);
        if (found < 0) break;
        positions.push(found);
        idx = found + term.length;
      }
      if (positions.length === 0) continue;
      const snippets = positions.slice(0, 3).map((p) => {
        const start = Math.max(0, p - 10);
        const end = Math.min(text.length, p + term.length + 10);
        return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
      });
      hits.push({ category: group.category, term, count: positions.length, snippets });
    }
  }
  return hits;
}
