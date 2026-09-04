import { NextRequest, NextResponse } from 'next/server';
import { searchHistory } from '@/lib/db/search';
import { semanticSearch } from '@/lib/ai/semanticSearch';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ hits: [], source: 'none' });
  const semantic = await semanticSearch(id, q, 6).catch(() => []);
  if (semantic.length > 0) {
    return NextResponse.json({
      source: 'semantic',
      hits: semantic.map((h) => ({ id: h.id, title: h.title, snippet: h.snippet, volumeTitle: '' })),
    });
  }
  return NextResponse.json({
    source: 'like',
    hits: searchHistory(id, q).map((h) => ({ id: h.id, title: h.title, snippet: h.snippet, volumeTitle: h.volumeTitle })),
  });
}
