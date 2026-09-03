import { NextRequest, NextResponse } from 'next/server';
import { deleteForeshadowing, getForeshadowing, updateForeshadowing } from '@/lib/db/foreshadowing';
import type { ForeshadowingStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const STATUSES: ForeshadowingStatus[] = ['planting', 'simmering', 'payoff'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const f = getForeshadowing(id);
  if (!f) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ foreshadowing: f });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateForeshadowing>[1] = {};
  if (typeof body?.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.status === 'string' && STATUSES.includes(body.status as ForeshadowingStatus)) patch.status = body.status as ForeshadowingStatus;
  if ('plantChapterId' in (body ?? {})) patch.plantChapterId = typeof body.plantChapterId === 'string' ? body.plantChapterId : null;
  if ('simmerRangeStart' in (body ?? {})) patch.simmerRangeStart = typeof body.simmerRangeStart === 'number' ? body.simmerRangeStart : null;
  if ('simmerRangeEnd' in (body ?? {})) patch.simmerRangeEnd = typeof body.simmerRangeEnd === 'number' ? body.simmerRangeEnd : null;
  if ('payoffChapterId' in (body ?? {})) patch.payoffChapterId = typeof body.payoffChapterId === 'string' ? body.payoffChapterId : null;
  if (Array.isArray(body?.relatedEntityIds)) patch.relatedEntityIds = body.relatedEntityIds.filter((x): x is string => typeof x === 'string');
  if (typeof body?.note === 'string') patch.note = body.note;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const f = updateForeshadowing(id, patch);
  if (!f) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ foreshadowing: f });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteForeshadowing(id)) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
