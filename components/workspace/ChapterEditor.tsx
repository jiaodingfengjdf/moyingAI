'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseDoc, serializeDoc, type Doc } from '@/lib/markdown';
import { GHOST_BRANCHES, REWRITE_MODES, type RewriteMode } from '@/lib/ai/prompts';
import { STYLE_TARGETS, type StyleTarget } from '@/lib/ai/style';
import { useAIStream } from '@/lib/useAIStream';
import AIOverlay from './AIOverlay';

interface Props {
  chapterId: string;
  title: string;
  initialContent: string;
  onChange: (md: string) => void;
}

const MENU_ACTIONS: { key: string; label: string; mode: RewriteMode | null }[] = [
  { key: 'expand', label: '扩写', mode: 'expand' },
  { key: 'senses', label: '五感', mode: 'senses' },
  { key: 'pace', label: '节奏', mode: 'pace' },
  { key: 'mood', label: '意境', mode: 'mood' },
  { key: 'style', label: '文风', mode: null },
  { key: 'check', label: '诊断', mode: null },
];

export default function ChapterEditor({ chapterId, title, initialContent, onChange }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [styleMenu, setStyleMenu] = useState<{ x: number; y: number } | null>(null);
  const replaceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ai = useAIStream();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const ghostRef = useRef<() => void>(() => {});
  const adoptRef = useRef<(index: number) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  cancelRef.current = ai.cancel;

  useEffect(() => () => cancelRef.current(), []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: '开始写作……（Alt+/ 触发续写，Tab 采纳第一条）' }),
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
    closeOverlay();
  }

  function closeOverlay() {
    ai.clear();
    setOverlayPos(null);
    replaceRangeRef.current = null;
  }

  ghostRef.current = triggerGhostwrite;
  adoptRef.current = adopt;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-gray-100 px-8 py-3 text-center">
        <h2 className="font-medium">{title}</h2>
      </div>
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
    </div>
  );
}
