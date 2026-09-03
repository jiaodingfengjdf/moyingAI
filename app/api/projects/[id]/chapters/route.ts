import { NextRequest, NextResponse } from 'next/server';
import { createChapter, listChaptersByProject } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ chapters: listChaptersByProject(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: projectId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!volumeId || !title) return NextResponse.json({ error: 'volumeId 与标题必填' }, { status: 400 });
  const volume = getVolume(volumeId);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  if (volume.projectId !== projectId) return NextResponse.json({ error: '卷不属于该项目' }, { status: 400 });
  const chapter = createChapter(volumeId, { title });
  return NextResponse.json({ chapter }, { status: 201 });
}
