import { NextRequest, NextResponse } from 'next/server';
import { markAccepted } from '@/lib/db/aiRequests';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!markAccepted(id, true)) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
