import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { addTimelineEntry, listEntities } from '@/lib/db/entities';
import { createAIRequest } from '@/lib/db/aiRequests';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';
import { buildNerMessages, parseNerMentions, resolveMentionEntity, type NerMention } from '@/lib/ai/ner';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const entities = listEntities(chapter.projectId);

  let mentions: NerMention[] = [];
  let aiSkipped: string | null = null;
  let model = 'mock';
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      const appeared = entities.filter((e) => [e.name, ...e.aliases].some((n) => n && chapter.content.includes(n)));
      mentions = appeared.slice(0, 3).map((e) => ({
        name: e.name,
        change: { 识别: '出场并记录（模拟输出）' },
        note: '由实体扫描识别',
      }));
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，仅返回词典级识别', 400);
      model = config.model;
      if (!chapter.content.trim()) throw new AIError('本章还没有正文，无法识别', 400);
      const text = await complete({ messages: buildNerMessages(chapter.content, entities), temperature: 0.1 });
      mentions = parseNerMentions(text);
    }
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = '实体识别失败，请重试';
  }

  let timelineAdded = 0;
  const unknownNames: string[] = [];
  const accepted: Array<{ name: string; note: string }> = [];
  for (const mention of mentions) {
    const entity = resolveMentionEntity(mention.name, entities);
    if (!entity) {
      unknownNames.push(mention.name);
      continue;
    }
    addTimelineEntry(entity.id, {
      chapterId,
      change: mention.change,
      note: mention.note || '由实体扫描自动记录',
    });
    timelineAdded += 1;
    accepted.push({ name: entity.name, note: mention.note });
  }
  createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'entity-scan', model, prompt: chapter.content.slice(0, 200) });
  return NextResponse.json({ mentions: accepted, unknownNames, timelineAdded, aiSkipped });
}
