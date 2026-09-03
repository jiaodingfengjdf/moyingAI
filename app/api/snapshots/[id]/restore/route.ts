import { NextRequest, NextResponse } from 'next/server';
import { restoreSnapshot } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const chapter = restoreSnapshot(id);
    return NextResponse.json({ chapter });
  } catch {
    return NextResponse.json({ error: '快照或章节不存在' }, { status: 404 });
  }
}
