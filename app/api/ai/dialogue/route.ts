import { NextRequest, NextResponse } from 'next/server';
import { getEntity } from '@/lib/db/entities';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildDialogueMessages, mockDialogue, parseDialogue } from '@/lib/ai/dialogue';
import type { Entity } from '@/lib/types';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const scenario = typeof body?.scenario === 'string' ? body.scenario.trim() : '';
  const characterIds = Array.isArray(body?.characterIds) ? body.characterIds.filter((x): x is string => typeof x === 'string') : [];
  if (!projectId) return NextResponse.json({ error: 'projectId 必填' }, { status: 400 });
  if (characterIds.length < 2 || characterIds.length > 4) return NextResponse.json({ error: '请选择 2~4 名角色' }, { status: 400 });
  if (!scenario) return NextResponse.json({ error: '情境不能为空' }, { status: 400 });
  const characters: Entity[] = [];
  for (const id of characterIds) {
    const e = getEntity(id);
    if (!e || e.projectId !== projectId || e.type !== 'character') return NextResponse.json({ error: '存在无效角色' }, { status: 404 });
    characters.push(e);
  }
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      createAIRequest({ projectId, chapterId: null, kind: 'dialogue', model: 'mock', prompt: scenario });
      return NextResponse.json({ lines: mockDialogue(characters.map((c) => c.name)) });
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
    const text = await complete({ messages: buildDialogueMessages(characters, scenario), temperature: 0.8 });
    const lines = parseDialogue(text);
    if (lines.length === 0) throw new AIError('生成结果无法解析，请重试', 502);
    createAIRequest({ projectId, chapterId: null, kind: 'dialogue', model: config.model, prompt: scenario });
    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '对白生成失败' }, { status: 500 });
  }
}
