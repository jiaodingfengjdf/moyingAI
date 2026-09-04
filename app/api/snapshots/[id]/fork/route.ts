import { NextRequest, NextResponse } from 'next/server';
import { forkSnapshotToChapter } from '@/lib/db/branch';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { chapter } = forkSnapshotToChapter(id);
    return NextResponse.json({ chapter }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message === '快照不存在' ? '快照不存在' : '章节不存在' }, { status: 404 });
  }
}
