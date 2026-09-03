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
  const data = body ?? {};
  const patch: Parameters<typeof updateForeshadowing>[1] = {};
  if (typeof data.title === 'string' && data.title.trim()) patch.title = data.title.trim();
  if (typeof data.status === 'string' && STATUSES.includes(data.status as ForeshadowingStatus)) patch.status = data.status as ForeshadowingStatus;
  if ('plantChapterId' in data) patch.plantChapterId = typeof data.plantChapterId === 'string' ? data.plantChapterId : null;
  if ('simmerRangeStart' in data) patch.simmerRangeStart = typeof data.simmerRangeStart === 'number' ? data.simmerRangeStart : null;
  if ('simmerRangeEnd' in data) patch.simmerRangeEnd = typeof data.simmerRangeEnd === 'number' ? data.simmerRangeEnd : null;
  if ('payoffChapterId' in data) patch.payoffChapterId = typeof data.payoffChapterId === 'string' ? data.payoffChapterId : null;
  if (Array.isArray(data.relatedEntityIds)) patch.relatedEntityIds = data.relatedEntityIds.filter((x): x is string => typeof x === 'string');
  if (typeof data.note === 'string') patch.note = data.note;
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
