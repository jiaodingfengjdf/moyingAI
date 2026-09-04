import type { Entity } from '../types';
import type { ChatMessage } from './provider';

export interface DialogueLine { speaker: string; line: string }

export function personaFields(e: { fields: Record<string, unknown> }) {
  return {
    want: String(e.fields.want ?? ''),
    need: String(e.fields.need ?? ''),
    flaw: String(e.fields.flaw ?? ''),
    moralBoundary: String(e.fields.moralBoundary ?? ''),
    speechTic: String(e.fields.speechTic ?? ''),
    speechStyle: String(e.fields.speechStyle ?? ''),
    speechPace: String(e.fields.speechPace ?? ''),
    speechRestraint: String(e.fields.speechRestraint ?? ''),
  };
}

function characterBlock(e: Entity): string {
  const p = personaFields(e);
  const parts = [
    `【${e.name}】${e.description || '（无描述）'}`,
    p.want && `表层欲望：${p.want}`,
    p.need && `底层需求/恐惧：${p.need}`,
    p.flaw && `缺陷：${p.flaw}`,
    p.moralBoundary && `道德底线：${p.moralBoundary}`,
    (p.speechTic || p.speechStyle || p.speechPace || p.speechRestraint) &&
      `台词指纹：口癖「${p.speechTic || '无'}」用词「${p.speechStyle || '平实'}」节奏「${p.speechPace || '常态'}」隐忍度「${p.speechRestraint || '中'}」`,
  ].filter(Boolean);
  return parts.join('；');
}

export function buildDialogueMessages(characters: Entity[], scenario: string): ChatMessage[] {
  const profiles = characters.map(characterBlock).join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是多角色对话导演。请严格按各角色人设推演一段博弈对话：不替角色说谎、不使用出戏的旁白。',
        '只输出 JSON 数组，元素 {"speaker":"角色名","line":"台词"}，共 4~10 句。',
      ].join('\n'),
    },
    { role: 'user', content: `${scenario.slice(0, 800)}\n\n角色设定：\n${profiles}` },
  ];
}

export function parseDialogue(text: string): DialogueLine[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { dialogue?: unknown }).dialogue) ? (parsed as { dialogue: unknown[] }).dialogue : [];
    const out: DialogueLine[] = [];
    for (const item of list) {
      if (typeof item === 'object' && item !== null) {
        const r = item as Record<string, unknown>;
        if (typeof r.speaker === 'string' && typeof r.line === 'string' && r.line.trim()) {
          out.push({ speaker: r.speaker, line: r.line });
        }
      }
    }
    return out;
  } catch {
    const out: DialogueLine[] = [];
    for (const line of stripped.split('\n')) {
      const m = line.trim().match(/^([^：:]{1,12})[：:]\s*(.+)$/);
      if (m) out.push({ speaker: m[1].trim(), line: m[2].trim() });
    }
    return out;
  }
}

export function mockDialogue(names: string[]): DialogueLine[] {
  return names.map((n, i) => ({
    speaker: n,
    line: i === 0 ? '你终于肯说了。' : '说了又如何，你已经没有退路。',
  }));
}
