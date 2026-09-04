'use client';

import { useState } from 'react';
import type { AIStreamState } from '@/lib/useAIStream';

interface Props {
  position: { x: number; y: number };
  state: AIStreamState;
  onInsert: (index: number) => void;
  onReplace: (index: number) => void;
  onMerge?: (indices: number[]) => void;
  canReplace: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export default function AIOverlay({ position, state, onInsert, onReplace, onMerge, canReplace, onClose, onRetry }: Props) {
  const isRewrite = state.kind === 'rewrite' || state.kind === 'style';
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(index: number) {
    setSelected((s) => (s.includes(index) ? s.filter((x) => x !== index) : [...s, index]));
  }

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
      style={{ left: Math.max(8, position.x), top: Math.max(8, position.y) }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-gray-500">{overlayTitle(state.kind)}</span>
        <span className="flex items-center gap-2">
          {!isRewrite && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selected.length > 0 && onMerge?.(selected)}
              disabled={selected.length === 0}
              className="text-xs text-blue-600 hover:underline disabled:text-gray-300"
            >
              合并插入{selected.length > 0 ? `（${selected.length}）` : ''}
            </button>
          )}
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
        </span>
      </div>
      {state.error && (
        <div className="mt-1 flex items-center justify-between rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          <span>{state.error}</span>
          <button onClick={onRetry} className="ml-2 shrink-0 text-blue-600 underline">重试</button>
        </div>
      )}
      <div className="mt-1 max-h-80 space-y-2 overflow-y-auto">
        {state.branches.map((b, i) => (
          <div key={b.id} className="rounded border border-gray-100 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-600">{b.label}</span>
              <span className="flex items-center gap-2">
                {!isRewrite && (
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                    选择
                  </label>
                )}
                {!b.done && <span className="text-xs text-amber-500">生成中…</span>}
              </span>
            </div>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-gray-700">{b.text || '…'}</p>
            <div className="mt-1 flex gap-2 text-xs">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(i)}
                disabled={!b.text}
                className="text-blue-600 hover:underline disabled:text-gray-300"
              >
                插入
              </button>
              {isRewrite && canReplace && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onReplace(i)}
                  disabled={!b.text}
                  className="text-emerald-600 hover:underline disabled:text-gray-300"
                >
                  替换选中
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function overlayTitle(kind: string | null): string {
  if (kind === 'rewrite') return 'AI 润色建议';
  if (kind === 'style') return '文风迁移';
  return '三条续写方向';
}
