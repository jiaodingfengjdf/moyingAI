import { NextRequest, NextResponse } from 'next/server';
import { listAnalysesByProject } from '@/lib/db/analyses';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ rows: listAnalysesByProject(id) });
}
