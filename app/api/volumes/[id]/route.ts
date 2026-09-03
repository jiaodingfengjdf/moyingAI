import { NextRequest, NextResponse } from 'next/server';
import { deleteVolume, getVolume, updateVolume } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const volume = getVolume(id);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ volume });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; summary?: string } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.summary === 'string') patch.summary = body.summary.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const volume = updateVolume(id, patch);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ volume });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteVolume(id)) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
