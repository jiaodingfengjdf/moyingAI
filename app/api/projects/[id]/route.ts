import { NextRequest, NextResponse } from 'next/server';
import { deleteProject, getProject, updateProject } from '@/lib/db/projects';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; penName?: string; description?: string } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.penName === 'string') patch.penName = body.penName.trim();
  if (typeof body?.description === 'string') patch.description = body.description.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const project = updateProject(id, patch);
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
