import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { getProjectOutline, updateProjectOutline } from '@/lib/db/bookOutline';
import type { BookArc } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

function parseArcs(value: unknown): BookArc[] | null {
  if (!Array.isArray(value)) return null;
  const arcs = value
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a) => ({
      id: String(a.id ?? ''),
      title: String(a.title ?? ''),
      goal: String(a.goal ?? ''),
      summary: String(a.summary ?? ''),
    }))
    .filter((a) => a.id && a.title);
  return arcs;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ outline: getProjectOutline(id) });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { synopsis?: string; theme?: string; arcs?: BookArc[] } = {};
  if (typeof body?.synopsis === 'string') patch.synopsis = body.synopsis;
  if (typeof body?.theme === 'string') patch.theme = body.theme;
  const arcs = parseArcs(body?.arcs);
  if (arcs) patch.arcs = arcs;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可保存的内容' }, { status: 400 });
  return NextResponse.json({ outline: updateProjectOutline(id, patch) });
}
