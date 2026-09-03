import { NextRequest, NextResponse } from 'next/server';
import { createForeshadowing, listForeshadowing } from '@/lib/db/foreshadowing';
import type { ForeshadowingStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const STATUSES: ForeshadowingStatus[] = ['planting', 'simmering', 'payoff'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ foreshadowing: listForeshadowing(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '伏笔标题不能为空' }, { status: 400 });
  const status = body?.status as ForeshadowingStatus;
  const f = createForeshadowing({
    projectId: id,
    title,
    status: STATUSES.includes(status) ? status : 'planting',
    plantChapterId: typeof body?.plantChapterId === 'string' ? body.plantChapterId : null,
    simmerRangeStart: typeof body?.simmerRangeStart === 'number' ? body.simmerRangeStart : null,
    simmerRangeEnd: typeof body?.simmerRangeEnd === 'number' ? body.simmerRangeEnd : null,
    payoffChapterId: typeof body?.payoffChapterId === 'string' ? body.payoffChapterId : null,
    relatedEntityIds: Array.isArray(body?.relatedEntityIds) ? body.relatedEntityIds.filter((x): x is string => typeof x === 'string') : [],
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ foreshadowing: f }, { status: 201 });
}
