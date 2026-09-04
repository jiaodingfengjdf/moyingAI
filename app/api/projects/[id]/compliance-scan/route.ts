import { NextRequest, NextResponse } from 'next/server';
import { listChaptersByProject } from '@/lib/db/chapters';
import { scanText } from '@/lib/compliance/terms';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const requested = Array.isArray(body?.chapterIds) ? new Set(body.chapterIds.filter((x): x is string => typeof x === 'string')) : null;
  const chapters = listChaptersByProject(id).filter((c) => (requested ? requested.has(c.id) : true));
  const results = chapters
    .filter((c) => c.content.trim())
    .map((c) => ({ chapterId: c.id, title: c.title, wordCount: c.wordCount, hits: scanText(c.content) }))
    .filter((r) => r.hits.length > 0);
  const summary = results.reduce((acc, r) => acc + r.hits.reduce((n, h) => n + h.count, 0), 0);
  return NextResponse.json({ scanned: chapters.filter((c) => c.content.trim()).length, hitChapters: results.length, totalHits: summary, results });
}
