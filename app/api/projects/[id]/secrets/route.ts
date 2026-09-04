import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { createSecret, listSecrets } from '@/lib/db/secrets';

type RouteContext = { params: Promise<{ id: string }> };

function parseKnownIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === 'string');
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ secrets: listSecrets(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '秘密标题不能为空' }, { status: 400 });
  const knownEntityIds = parseKnownIds(body?.knownEntityIds);
  return NextResponse.json({
    secret: createSecret(id, {
      title,
      detail: typeof body?.detail === 'string' ? body.detail : '',
      knownEntityIds: knownEntityIds ?? [],
      note: typeof body?.note === 'string' ? body.note : '',
    }),
  });
}
