import { NextRequest, NextResponse } from 'next/server';
import { insertSkeleton } from '@/lib/beats/apply';
import type { SkeletonPayload } from '@/lib/beats/templates';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  const skeleton = body?.skeleton as SkeletonPayload | undefined;
  if (!projectId || !volumeId) return NextResponse.json({ error: 'projectId 与 volumeId 必填' }, { status: 400 });
  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters.filter((c) => typeof c?.title === 'string' && c.title.trim()) : [];
  if (chapters.length === 0) return NextResponse.json({ error: '骨架缺少章节' }, { status: 400 });
  try {
    const counts = insertSkeleton(projectId, volumeId, {
      volumeOutline: typeof skeleton?.volumeOutline === 'string' ? skeleton.volumeOutline : '',
      chapters: chapters as SkeletonPayload['chapters'],
    });
    return NextResponse.json({ ...counts }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '卷不存在或不属于该项目' }, { status: 404 });
  }
}
