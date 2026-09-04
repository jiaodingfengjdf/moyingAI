import { NextRequest, NextResponse } from 'next/server';
import { deleteRelationship, getRelationship, updateRelationship } from '@/lib/db/relationships';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const relationship = getRelationship(id);
  if (!relationship) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ relationship });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateRelationship>[1] = {};
  if (typeof body?.type === 'string' && body.type.trim()) patch.type = body.type.trim();
  if (typeof body?.strength === 'number' && Number.isFinite(body.strength)) patch.strength = Math.max(-100, Math.min(100, body.strength));
  if (typeof body?.note === 'string') patch.note = body.note;
  if ('chapterAnchorId' in (body ?? {})) patch.chapterAnchorId = body && typeof body.chapterAnchorId === 'string' ? body.chapterAnchorId : null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const relationship = updateRelationship(id, patch);
  if (!relationship) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ relationship });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteRelationship(id)) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
