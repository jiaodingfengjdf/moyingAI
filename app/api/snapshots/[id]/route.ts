import { NextRequest, NextResponse } from 'next/server';
import { deleteSnapshot, getSnapshot } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const snapshot = getSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: '快照不存在' }, { status: 404 });
  return NextResponse.json({ snapshot });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteSnapshot(id)) return NextResponse.json({ error: '快照不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
