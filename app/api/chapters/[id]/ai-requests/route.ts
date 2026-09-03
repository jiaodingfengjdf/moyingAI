import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { listByChapter } from '@/lib/db/aiRequests';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ requests: listByChapter(id) });
}
