import { NextRequest, NextResponse } from 'next/server';
import { listEntityStatus } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ status: listEntityStatus(id) });
}
