import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { createEntity, listEntities } from '@/lib/db/entities';
import type { EntityType } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const TYPES: EntityType[] = ['character', 'faction', 'location', 'system', 'artifact'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ entities: listEntities(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body?.type as EntityType;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!TYPES.includes(type)) return NextResponse.json({ error: '实体类型不合法' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '实体名称不能为空' }, { status: 400 });
  const entity = createEntity({
    projectId: id,
    type,
    name,
    aliases: Array.isArray(body?.aliases) ? body.aliases.filter((a): a is string => typeof a === 'string') : [],
    fields: body?.fields && typeof body.fields === 'object' ? body.fields as Record<string, unknown> : {},
    description: typeof body?.description === 'string' ? body.description : '',
    rules: Array.isArray(body?.rules) ? body.rules.filter((r): r is string => typeof r === 'string') : [],
  });
  return NextResponse.json({ entity }, { status: 201 });
}
