import { NextRequest, NextResponse } from 'next/server';
import { listChaptersByProject } from '@/lib/db/chapters';
import { ensureChapterEmbedding } from '@/lib/ai/semanticSearch';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const chapters = listChaptersByProject(id);
  let done = 0;
  for (const c of chapters) {
    try {
      await ensureChapterEmbedding(c.id);
      done += 1;
    } catch {
      // 单章失败跳过
    }
  }
  return NextResponse.json({ total: chapters.length, embedded: done });
}
