'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseDoc, serializeDoc, type Doc } from '@/lib/markdown';
import { GHOST_BRANCHES, REWRITE_MODES, type RewriteMode } from '@/lib/ai/prompts';
import { STYLE_TARGETS, type StyleTarget } from '@/lib/ai/style';
import type { BlockIdea } from '@/lib/ai/blockBreaker';
import type { ConsistencyIssue } from '@/lib/types';
import { useAIStream } from '@/lib/useAIStream';
import AIOverlay from './AIOverlay';

interface Props {
  chapterId: string;
  title: string;
  initialContent: string;
  onChange: (md: string) => void;
  highlightIssues?: ConsistencyIssue[];
  blockedIssues?: ConsistencyIssue[] | null;
  onBlockIgnored?: () => void;
}

const MENU_ACTIONS: { key: string; label: string; mode: RewriteMode | null }[] = [
  { key: 'expand', label: '扩写', mode: 'expand' },
  { key: 'senses', label: '五感', mode: 'senses' },
  { key: 'pace', label: '节奏', mode: 'pace' },
  { key: 'mood', label: '意境', mode: 'mood' },
  { key: 'style', label: '文风', mode: null },
  { key: 'check', label: '诊断', mode: null },
];

const ISSUE_MARKS_KEY = new PluginKey('consistencyIssueMarks');

const ConsistencyIssueMarks = Extension.create({
  name: 'consistencyIssueMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ISSUE_MARKS_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            const next = tr.getMeta(ISSUE_MARKS_KEY);
            if (next) return next as DecorationSet;
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => (ISSUE_MARKS_KEY.getState(state) as DecorationSet | undefined) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

interface IssueRange {
  issueIndex: number;
  from: number;
  to: number;
}

export default function ChapterEditor({
  chapterId,
  title,
  initialContent,
  onChange,
  highlightIssues = [],
  blockedIssues = null,
  onBlockIgnored,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [blockNote, setBlockNote] = useState('');
  const [confirmIgnore, setConfirmIgnore] = useState(false);
  const [styleMenu, setStyleMenu] = useState<{ x: number; y: number } | null>(null);
  const [wheel, setWheel] = useState<{ x: number; y: number; ideas: BlockIdea[]; loading: boolean; error: string } | null>(null);
  const replaceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ai = useAIStream();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const ghostRef = useRef<() => void>(() => {});
  const adoptRef = useRef<(index: number) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const escRef = useRef<() => boolean>(() => false);
  const issueRangesRef = useRef<IssueRange[]>([]);
  const blockedRef = useRef(blockedIssues);
  blockedRef.current = blockedIssues;
  cancelRef.current = ai.cancel;

  useEffect(() => () => cancelRef.current(), []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: '开始写作……（Alt+/ 触发续写，Tab 采纳第一条）' }),
        ConsistencyIssueMarks,
      ],
      content: parseDoc(initialContent) as unknown as JSONContent,
      editorProps: {
        attributes: {
          class: 'px-8 py-6 focus:outline-none',
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Tab' && aiRef.current.state.branches.some((b) => b.done)) {
            event.preventDefault();
            adoptRef.current(0);
            return true;
          }
          if (event.altKey && event.key === '/') {
            event.preventDefault();
            ghostRef.current();
            return true;
          }
          if (event.key === 'Escape') {
            if (escRef.current()) {
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => {
        onChangeRef.current(serializeDoc(e.getJSON() as unknown as Doc));
      },
      onSelectionUpdate: ({ editor: e }) => {
        const { from, to, empty } = e.state.selection;
        if (empty || from === to) {
          setMenu(null);
          return;
        }
        const rect = e.view.coordsAtPos(to);
        setMenu({ x: rect.left, y: rect.top - 44 });
      },
      onBlur: () => setMenu(null),
    },
    [],
  );

  const issueSignature = JSON.stringify(highlightIssues.map((i) => [i.type, i.text, i.reason]));

  useEffect(() => {
    if (!editor) return;
    const ranges: IssueRange[] = [];
    highlightIssues.forEach((issue, issueIndex) => {
      const query = issue.text.trim();
      if (!query) return;
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const text = node.text;
        let from = text.indexOf(query);
        while (from >= 0) {
          ranges.push({ issueIndex, from: pos + from, to: pos + from + query.length });
          const next = text.indexOf(query, from + query.length);
          if (next < 0) break;
          from = next;
        }
      });
    });
    issueRangesRef.current = ranges
      .sort((a, b) => a.from - b.from || a.to - b.to)
      .filter((r, i, all) => i === 0 || r.from >= all[i - 1].to);
    const decorations = issueRangesRef.current.map((r) => Decoration.inline(r.from, r.to, { class: 'consistency-hit' }));
    editor.view.dispatch(editor.state.tr.setMeta(ISSUE_MARKS_KEY, DecorationSet.create(editor.state.doc, decorations)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, issueSignature]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!blockedIssues || blockedIssues.length === 0);
  }, [editor, blockedIssues]);

  useEffect(() => {
    setConfirmIgnore(false);
    setBlockNote('');
  }, [blockedIssues]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ issueIndex?: number } | null>).detail;
      const issueIndex = detail?.issueIndex;
      if (typeof issueIndex !== 'number' || !editor) return;
      const range = issueRangesRef.current.find((r) => r.issueIndex === issueIndex);
      if (!range) return;
      editor.commands.focus();
      editor.commands.setTextSelection({ from: range.from, to: range.to });
      editor.commands.scrollIntoView();
    };
    window.addEventListener('consistency:locate', handler);
    return () => window.removeEventListener('consistency:locate', handler);
  }, [editor]);

  function cursorContext(e: Editor) {
    const from = e.state.selection.from;
    return {
      before: e.state.doc.textBetween(0, from, '\n', ' ').slice(-2000),
      after: e.state.doc.textBetween(from, e.state.doc.content.size, '\n', ' ').slice(0, 300),
    };
  }

  function selectionContext(e: Editor) {
    const { from, to } = e.state.selection;
    return {
      selected: e.state.doc.textBetween(from, to, '\n', ' '),
      before: e.state.doc.textBetween(0, from, '\n', ' ').slice(-2000),
      after: e.state.doc.textBetween(to, e.state.doc.content.size, '\n', ' ').slice(0, 300),
    };
  }

  function triggerGhostwrite() {
    if (!editor) return;
    const { before, after } = cursorContext(editor);
    const rect = editor.view.coordsAtPos(editor.state.selection.from);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/ghostwrite', { chapterId, before, after }, 'ghostwrite', GHOST_BRANCHES.map((b) => b.label));
  }

  function triggerRewrite(mode: RewriteMode) {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const ctx = selectionContext(editor);
    replaceRangeRef.current = { from, to };
    const rect = editor.view.coordsAtPos(to);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/rewrite', { chapterId, mode, ...ctx }, 'rewrite', [REWRITE_MODES[mode].label]);
  }

  function openStyleMenu() {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const pos = empty ? from : to;
    const rect = editor.view.coordsAtPos(pos);
    setStyleMenu({ x: rect.left, y: rect.bottom + 8 });
  }

  function triggerStyle(target: StyleTarget) {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    let sourceText: string;
    if (!empty) {
      replaceRangeRef.current = { from, to };
      sourceText = editor.state.doc.textBetween(from, to, '\n', ' ');
    } else {
      replaceRangeRef.current = null;
      const before = cursorContext(editor).before;
      sourceText = before.slice(-1500);
      if (!sourceText.trim()) sourceText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ').slice(-1500);
    }
    if (!sourceText.trim()) return;
    const pos = empty ? from : to;
    const rect = editor.view.coordsAtPos(pos);
    setStyleMenu(null);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/style-transfer', { chapterId, sourceText, target }, 'style', [STYLE_TARGETS[target].label]);
  }

  async function openBlockBreaker() {
    if (!editor) return;
    const ctx = cursorContext(editor);
    const rect = editor.view.coordsAtPos(editor.state.selection.from);
    setWheel({ x: rect.left, y: rect.bottom + 8, ideas: [], loading: true, error: '' });
    try {
      const res = await fetch('/api/ai/block-breaker/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, before: ctx.before, after: ctx.after }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWheel((w) => (w ? { ...w, loading: false, error: json.error ?? '生成失败' } : w));
        return;
      }
      setWheel((w) => (w ? { ...w, loading: false, ideas: json.ideas as BlockIdea[] } : w));
    } catch {
      setWheel((w) => (w ? { ...w, loading: false, error: '破局点子生成失败' } : w));
    }
  }

  async function adoptWheelIdea(category: string, idea: string) {
    if (!editor) return;
    const ctx = cursorContext(editor);
    const rect = editor.view.coordsAtPos(editor.state.selection.from);
    setWheel(null);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/block-breaker/continue', { chapterId, before: ctx.before, after: ctx.after, category, idea }, 'blockbreak', [category]);
  }

  function adopt(index: number) {
    if (!editor) return;
    const text = aiRef.current.state.branches[index]?.text;
    if (!text) return;
    if (aiRef.current.state.kind !== 'ghostwrite' && replaceRangeRef.current) {
      editor.chain().focus().insertContentAt(replaceRangeRef.current, text).run();
    } else {
      editor.chain().focus().insertContent(text).run();
    }
    if (aiRef.current.state.requestId) {
      void fetch(`/api/ai-requests/${aiRef.current.state.requestId}/accept`, { method: 'POST' })
        .then(() => window.dispatchEvent(new Event('ai:adopted')));
    }
    if (blockedRef.current) onBlockIgnored?.();
    closeOverlay();
  }

  function mergeBranches(indices: number[]) {
    if (!editor) return;
    const texts = indices
      .map((i) => aiRef.current.state.branches[i]?.text)
      .filter((t): t is string => Boolean(t));
    if (texts.length === 0) return;
    editor.chain().focus().insertContent(texts.join('\n\n')).run();
    if (aiRef.current.state.requestId) {
      void fetch(`/api/ai-requests/${aiRef.current.state.requestId}/accept`, { method: 'POST' })
        .then(() => window.dispatchEvent(new Event('ai:adopted')));
    }
    if (blockedRef.current) onBlockIgnored?.();
    closeOverlay();
  }

  function triggerFixIssue(issueIndex: number) {
    if (!editor || !blockedIssues) return;
    const issue = blockedIssues[issueIndex];
    if (!issue) return;
    let range = issueRangesRef.current.find((r) => r.issueIndex === issueIndex);
    if (!range && issue.text.trim()) {
      const query = issue.text.trim();
      let fallback: IssueRange | undefined;
      editor.state.doc.descendants((node, pos) => {
        if (fallback || !node.isText || !node.text) return;
        const idx = node.text.indexOf(query);
        if (idx >= 0) fallback = { issueIndex, from: pos + idx, to: pos + idx + query.length };
      });
      range = fallback;
    }
    if (!range) {
      setBlockNote(`正文中未定位到「${issue.text}」，请改为手动选中冲突片段后使用润色里的「一致性修复」。`);
      return;
    }
    const selected = editor.state.doc.textBetween(range.from, range.to, '\n', ' ');
    if (!selected.trim()) {
      setBlockNote('选中内容为空，无法修复。');
      return;
    }
    const before = editor.state.doc.textBetween(0, range.from, '\n', ' ').slice(-2000);
    const after = editor.state.doc.textBetween(range.to, editor.state.doc.content.size, '\n', ' ').slice(0, 300);
    replaceRangeRef.current = { from: range.from, to: range.to };
    const rect = editor.view.coordsAtPos(range.to);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    const hint = [issue.reason, issue.suggestion].filter(Boolean).join('；');
    void ai.run(
      '/api/ai/rewrite',
      { chapterId, mode: 'fix', hint, selected, before, after },
      'rewrite',
      [REWRITE_MODES.fix.label],
    );
  }

  function closeOverlay() {
    ai.clear();
    setOverlayPos(null);
    replaceRangeRef.current = null;
  }

  escRef.current = () => {
    let handled = false;
    if (styleMenu) {
      setStyleMenu(null);
      handled = true;
    }
    if (wheel) {
      setWheel(null);
      handled = true;
    }
    if (overlayPos || ai.state.branches.length > 0 || ai.state.error) {
      closeOverlay();
      handled = true;
    }
    return handled;
  };

  ghostRef.current = triggerGhostwrite;
  adoptRef.current = adopt;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
        <div className="flex-1 text-center">
          <h2 className="font-medium">{title}</h2>
        </div>
        <button
          onClick={() => void openBlockBreaker()}
          disabled={ai.state.loading}
          title="剧情破局轮盘：从当前困局生成非常规变数"
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          🎡 破局
        </button>
      </div>
      {editor && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-3 py-1 text-xs text-gray-600">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'rounded bg-blue-100 px-2 py-0.5 font-bold' : 'rounded px-2 py-0.5 hover:bg-gray-100'} title="加粗">B</button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'rounded bg-blue-100 px-2 py-0.5 italic' : 'rounded px-2 py-0.5 hover:bg-gray-100'} title="斜体">I</button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'rounded bg-blue-100 px-2 py-0.5' : 'rounded px-2 py-0.5 hover:bg-gray-100'} title="一级标题">H1</button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'rounded bg-blue-100 px-2 py-0.5' : 'rounded px-2 py-0.5 hover:bg-gray-100'} title="二级标题">H2</button>
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className="rounded px-2 py-0.5 hover:bg-gray-100" title="无序列表">• 列表</button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className="rounded px-2 py-0.5 hover:bg-gray-100" title="有序列表">1. 列表</button>
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className="rounded px-2 py-0.5 hover:bg-gray-100" title="引用">” 引用</button>
          <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className="rounded px-2 py-0.5 hover:bg-gray-100" title="代码块">` 代码</button>
          <span className="mx-1 text-gray-200">|</span>
          <button onClick={() => editor.chain().focus().undo().run()} title="撤销">↶ 撤销</button>
          <button onClick={() => editor.chain().focus().redo().run()} title="重做">↷ 重做</button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {editor ? <EditorContent editor={editor} className="h-full" /> : null}
      </div>
      {menu && (
        <div
          className="fixed z-50 flex gap-1 rounded-md border border-gray-200 bg-white px-1 py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {MENU_ACTIONS.map((a) =>
            a.mode ? (
              <button
                key={a.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => triggerRewrite(a.mode!)}
                className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {a.label}
              </button>
            ) : a.key === 'style' ? (
              <button
                key={a.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openStyleMenu()}
                className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {a.label}
              </button>
            ) : (
              <button
                key={a.key}
                disabled
                title="M3 启用"
                className="cursor-not-allowed rounded px-2 py-1 text-xs text-gray-400"
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
      {overlayPos && (
        <AIOverlay
          position={overlayPos}
          state={ai.state}
          onInsert={adopt}
          onReplace={adopt}
          onMerge={mergeBranches}
          canReplace={ai.state.kind !== 'ghostwrite' && replaceRangeRef.current !== null}
          onClose={closeOverlay}
          onRetry={ai.retry}
          onStop={ai.cancel}
        />
      )}
      {styleMenu && (
        <div
          className="fixed z-50 flex flex-col gap-1 rounded-md border border-gray-200 bg-white px-1 py-1 shadow-lg"
          style={{ left: Math.max(8, styleMenu.x), top: Math.max(8, styleMenu.y) }}
        >
          {(Object.keys(STYLE_TARGETS) as StyleTarget[]).map((t) => (
            <button
              key={t}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => triggerStyle(t)}
              className="rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100"
            >
              {STYLE_TARGETS[t].label}
            </button>
          ))}
        </div>
      )}
      {wheel && (
        <div
          className="fixed z-50 w-96 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
          style={{ left: Math.max(8, wheel.x), top: Math.max(8, wheel.y) }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">剧情破局轮盘</span>
            <span className="flex gap-2">
              <button onClick={() => void openBlockBreaker()} disabled={wheel.loading} className="text-xs text-blue-600">再转一次</button>
              <button onClick={() => setWheel(null)} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
            </span>
          </div>
          {wheel.loading && <p className="mt-2 text-xs text-amber-500">转盘中…</p>}
          {wheel.error && <p className="mt-2 text-xs text-red-600">{wheel.error}</p>}
          <div className="mt-2 space-y-2">
            {wheel.ideas.map((idea, i) => (
              <div key={i} className="rounded border border-gray-100 p-2 text-xs">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{idea.category}</span>
                <span className="ml-2 font-medium text-gray-700">{idea.title}</span>
                <p className="mt-1 text-gray-600">{idea.idea}</p>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void adoptWheelIdea(idea.category, idea.idea)}
                  className="mt-1 text-blue-600 hover:underline"
                >
                  以此破局续写
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {blockedIssues && blockedIssues.length > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-red-700">一致性熔断</h3>
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{blockedIssues.length} 处冲突</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              写作已暂停，正文中的冲突位置已标红。可逐条交给 AI 修复；也可确认后忽略本次熔断继续写作。
            </p>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {blockedIssues.map((issue, i) => (
                <div key={`${issue.type}-${i}`} className="rounded border border-red-100 bg-red-50/60 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-red-700">{issue.type}</span>
                    <span className="text-gray-400">{issue.source === 'rule' ? '规则' : 'AI'}</span>
                  </div>
                  {issue.text && <p className="mt-1 text-red-800">{issue.text}</p>}
                  {issue.reason && <p className="mt-1 text-gray-600">原因：{issue.reason}</p>}
                  {issue.suggestion && <p className="mt-1 text-gray-600">建议：{issue.suggestion}</p>}
                  <button
                    onClick={() => triggerFixIssue(i)}
                    disabled={ai.state.loading}
                    className="mt-1.5 rounded border border-blue-200 px-2 py-0.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {ai.state.loading ? '生成中…' : 'AI 修复此冲突'}
                  </button>
                </div>
              ))}
            </div>
            {blockNote && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{blockNote}</p>}
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <p className="text-[10px] text-gray-400">AI 修复需在设置中配置模型密钥；未定位到原文的冲突请手动选中后处理。</p>
              <button
                onClick={() => {
                  if (confirmIgnore) {
                    onBlockIgnored?.();
                  } else {
                    setConfirmIgnore(true);
                  }
                }}
                className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                {confirmIgnore ? '再次点击，确认忽略并继续' : '忽略全部并继续'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
