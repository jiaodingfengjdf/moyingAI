import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { createVolume, listVolumes } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ volumes: listVolumes(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '卷标题不能为空' }, { status: 400 });
  const volume = createVolume(id, {
    title,
    summary: typeof body?.summary === 'string' ? body.summary.trim() : '',
  });
  return NextResponse.json({ volume }, { status: 201 });
}
