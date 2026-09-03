import { NextRequest, NextResponse } from 'next/server';
import { deleteChapter, getChapter, updateChapter } from '@/lib/db/chapters';
import type { ChapterStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const chapter = getChapter(id);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ chapter });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; content?: string; outline?: string; status?: ChapterStatus } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.content === 'string') patch.content = body.content;
  if (typeof body?.outline === 'string') patch.outline = body.outline;
  if (body?.status === 'draft' || body?.status === 'final') patch.status = body.status;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const chapter = updateChapter(id, patch);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ chapter });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
