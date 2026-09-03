'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseDoc, serializeDoc, type Doc } from '@/lib/markdown';

interface Props {
  title: string;
  initialContent: string;
  onChange: (md: string) => void;
}

const MENU_ACTIONS = [
  { key: 'expand', label: '扩写' },
  { key: 'senses', label: '五感' },
  { key: 'pace', label: '节奏' },
  { key: 'mood', label: '意境' },
  { key: 'check', label: '诊断' },
];

export default function ChapterEditor({ title, initialContent, onChange }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: '开始写作……（M2 将启用 Tab 采纳补全）' }),
      ],
      content: parseDoc(initialContent) as unknown as JSONContent,
      editorProps: {
        attributes: {
          class: 'px-8 py-6 focus:outline-none',
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
          {MENU_ACTIONS.map((a) => (
            <button
              key={a.key}
              disabled
              title="M2 启用"
              className="cursor-not-allowed rounded px-2 py-1 text-xs text-gray-400"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
