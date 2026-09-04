import { NextRequest, NextResponse } from 'next/server';
import { deleteScene, getScene, updateScene } from '@/lib/db/scenes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const scene = getScene(id);
  if (!scene) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ scene });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateScene>[1] = {};
  if (typeof body?.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.goal === 'string') patch.goal = body.goal;
  if (typeof body?.points === 'string') patch.points = body.points;
  if (body?.status === 'draft' || body?.status === 'done') patch.status = body.status;
  if (typeof body?.order === 'number') patch.order = body.order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const scene = updateScene(id, patch);
  if (!scene) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ scene });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteScene(id)) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
