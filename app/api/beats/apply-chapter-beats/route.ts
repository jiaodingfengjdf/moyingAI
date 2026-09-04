import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { insertBeats } from '@/lib/beats/apply';
import type { Beat } from '@/lib/beats/templates';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const beats = Array.isArray(body?.beats) ? (body.beats as Beat[]).filter((b) => typeof b?.title === 'string' && b.title.trim()) : [];
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  if (!getChapter(chapterId)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  if (beats.length === 0) return NextResponse.json({ error: '节拍列表为空' }, { status: 400 });
  const sceneCount = insertBeats(chapterId, beats);
  return NextResponse.json({ sceneCount }, { status: 201 });
}
