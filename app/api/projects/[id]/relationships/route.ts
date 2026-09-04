import { NextRequest, NextResponse } from 'next/server';
import { createRelationship, listRelationships } from '@/lib/db/relationships';
import { getEntity } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ relationships: listRelationships(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const fromEntityId = typeof body?.fromEntityId === 'string' ? body.fromEntityId : '';
  const toEntityId = typeof body?.toEntityId === 'string' ? body.toEntityId : '';
  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  const strength = Number(body?.strength);
  if (!fromEntityId || !toEntityId || fromEntityId === toEntityId) return NextResponse.json({ error: '请选择两个不同的实体' }, { status: 400 });
  if (!type || !Number.isFinite(strength)) return NextResponse.json({ error: '类型与好感度必填' }, { status: 400 });
  if (!getEntity(fromEntityId) || !getEntity(toEntityId)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  const relationship = createRelationship({
    projectId: id,
    fromEntityId,
    toEntityId,
    type,
    strength: Math.max(-100, Math.min(100, strength)),
    chapterAnchorId: typeof body?.chapterAnchorId === 'string' ? body.chapterAnchorId : null,
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ relationship }, { status: 201 });
}
