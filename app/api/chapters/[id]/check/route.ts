import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext } from '@/lib/ai/context';
import { buildConsistencyMessages, parseConflicts, runRuleChecks } from '@/lib/ai/consistency';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const chapter = getChapter(id);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const content = typeof body?.content === 'string' ? body.content : chapter.content;

  const ruleIssues = runRuleChecks({ projectId: chapter.projectId, content });
  let llmIssues: ReturnType<typeof parseConflicts> = [];
  let aiSkipped: string | null = null;
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      llmIssues = [{ type: '设定冲突（模拟）', text: '示例冲突文本', reason: '模拟审查输出', suggestion: '接入真实密钥后由模型给出建议', source: 'llm' }];
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，仅执行规则检查', 400);
      const ctx = await assembleContext({ projectId: chapter.projectId, chapterId: id, before: content.slice(-2000), after: '' });
      const text = await complete({ messages: buildConsistencyMessages(ctx, content), temperature: 0.2 });
      llmIssues = parseConflicts(text);
    }
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = 'AI 审查失败，仅返回规则检查结果';
  }
  return NextResponse.json({ issues: [...ruleIssues, ...llmIssues], aiSkipped });
}
