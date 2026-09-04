import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createScene, listScenes } from '@/lib/db/scenes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ scenes: listScenes(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '场景标题不能为空' }, { status: 400 });
  const scene = createScene(id, {
    title,
    goal: typeof body?.goal === 'string' ? body.goal : '',
    points: typeof body?.points === 'string' ? body.points : '',
    status: body?.status === 'done' ? 'done' : 'draft',
  });
  return NextResponse.json({ scene }, { status: 201 });
}
