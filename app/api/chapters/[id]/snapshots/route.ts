import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createSnapshot, listSnapshots } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ snapshots: listSnapshots(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const snapshot = createSnapshot(id, {
    label: typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : undefined,
    branchId: typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : undefined,
  });
  return NextResponse.json({ snapshot }, { status: 201 });
}
