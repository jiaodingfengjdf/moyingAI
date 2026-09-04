import { NextRequest, NextResponse } from 'next/server';
import { deleteSecret, updateSecret } from '@/lib/db/secrets';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; detail?: string; knownEntityIds?: string[]; note?: string } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.detail === 'string') patch.detail = body.detail;
  if (typeof body?.note === 'string') patch.note = body.note;
  if (Array.isArray(body?.knownEntityIds)) patch.knownEntityIds = body.knownEntityIds.filter((v): v is string => typeof v === 'string');
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const secret = updateSecret(id, patch);
  if (!secret) return NextResponse.json({ error: '秘密不存在' }, { status: 404 });
  return NextResponse.json({ secret });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteSecret(id)) return NextResponse.json({ error: '秘密不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
