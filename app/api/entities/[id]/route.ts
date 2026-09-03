import { NextRequest, NextResponse } from 'next/server';
import { deleteEntity, getEntity, updateEntity } from '@/lib/db/entities';
import type { EntityType } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const TYPES: EntityType[] = ['character', 'faction', 'location', 'system', 'artifact'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const entity = getEntity(id);
  if (!entity) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ entity });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateEntity>[1] = {};
  if (typeof body?.type === 'string' && TYPES.includes(body.type as EntityType)) patch.type = body.type as EntityType;
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body?.aliases)) patch.aliases = body.aliases.filter((a): a is string => typeof a === 'string');
  if (body?.fields && typeof body.fields === 'object') patch.fields = body.fields as Record<string, unknown>;
  if (typeof body?.description === 'string') patch.description = body.description;
  if (Array.isArray(body?.rules)) patch.rules = body.rules.filter((r): r is string => typeof r === 'string');
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const entity = updateEntity(id, patch);
  if (!entity) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ entity });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
