import { NextRequest, NextResponse } from 'next/server';
import { addTimelineEntry, getEntity, listTimeline } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ timeline: listTimeline(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const entry = addTimelineEntry(id, {
    chapterId: typeof body?.chapterId === 'string' ? body.chapterId : null,
    change: body?.change && typeof body.change === 'object' ? body.change as Record<string, unknown> : {},
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ entry }, { status: 201 });
}
