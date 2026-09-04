import { getVolume } from '../db/volumes';
import { getChapter } from '../db/chapters';
import { listEntities } from '../db/entities';
import { searchHistory } from '../db/search';
import { semanticSearch } from './semanticSearch';
import type { DB } from '../db/client';
import type { Entity } from '../types';
import { REWRITE_MODES, SYSTEM_PROMPT, type GhostBranchSpec, type RewriteMode } from './prompts';
import type { ChatMessage } from './provider';

export interface EntityLite {
  name: string;
  type: string;
  description: string;
  fields: string;
}

export interface AssembledContext {
  volumeTitle: string;
  chapterTitle: string;
  outline: string;
  entities: EntityLite[];
  history: { title: string; volumeTitle: string; snippet: string }[];
}

export function entityMatch(text: string, entities: Entity[]): Entity[] {
  const haystack = text.toLowerCase();
  return entities.filter((e) => [e.name, ...e.aliases].some((n) => n && haystack.includes(n.toLowerCase())));
}

export function trimEntity(e: Entity): EntityLite {
  const picked = Object.entries(e.fields).slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`).join('；');
  return {
    name: e.name,
    type: e.type,
    description: e.description.slice(0, 300),
    fields: picked,
  };
}

export async function assembleContext(
  opts: { projectId: string; chapterId: string; before: string; after: string },
  db?: DB,
): Promise<AssembledContext> {
  const chapter = getChapter(opts.chapterId, db);
  if (!chapter) throw new Error('章节不存在');
  const volume = getVolume(chapter.volumeId, db);
  const entities = entityMatch(opts.before + opts.after, listEntities(opts.projectId, db));
  const queryText = opts.before.slice(-2000);
  const semantic = await semanticSearch(opts.projectId, queryText, 3, db).catch(() => []);
  const history = semantic.length > 0
    ? semantic.map((h) => ({ title: h.title, volumeTitle: '', snippet: h.snippet }))
    : searchHistory(opts.projectId, queryText, db);
  return {
    volumeTitle: volume?.title ?? '',
    chapterTitle: chapter.title,
    outline: chapter.outline,
    entities: entities.slice(0, 8).map(trimEntity),
    history,
  };
}

export function renderContextBlock(ctx: AssembledContext): string {
  const parts = [
    `当前卷：${ctx.volumeTitle}`,
    `当前章：${ctx.chapterTitle}`,
    ctx.outline ? `本章大纲：${ctx.outline}` : '',
    ctx.entities.length
      ? '相关设定卡：\n' + ctx.entities.map((e) => `- ${e.name}（${e.type}）：${e.description}${e.fields ? '；' + e.fields : ''}`).join('\n')
      : '',
    ctx.history.length
      ? '历史相关片段（仅参考，勿照抄）：\n' + ctx.history.map((h) => `- [${h.volumeTitle}·${h.title}] ${h.snippet}`).join('\n')
      : '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

export function buildGhostwriteMessages(ctx: AssembledContext, branch: GhostBranchSpec, before: string, after: string): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `【任务：${branch.label}】${branch.instruction}\n\n请从下面断点处直接续写：\n\n${before.slice(-2000)}\n⟦光标⟧${after.slice(0, 300)}` },
  ];
}

export function buildRewriteMessages(ctx: AssembledContext, mode: RewriteMode, selected: string): ChatMessage[] {
  const spec = REWRITE_MODES[mode];
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `【任务：${spec.label}】${spec.instruction}\n\n待处理片段：\n\n${selected.slice(0, 2000)}` },
  ];
}

export { REWRITE_MODES, SYSTEM_PROMPT };
