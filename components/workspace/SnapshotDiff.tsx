'use client';

import { diffLines } from 'diff';
import type { ChapterSnapshot } from '@/lib/types';

interface Props {
  current: string;
  snapshot: ChapterSnapshot;
  onClose: () => void;
}

export default function SnapshotDiff({ current, snapshot, onClose }: Props) {
  const parts = diffLines(snapshot.content, current);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="font-medium">
            对比 v{snapshot.version}
            {snapshot.label ? `（${snapshot.label}）` : ''} vs 当前
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="overflow-y-auto p-4 font-mono text-xs leading-6">
          <pre className="whitespace-pre-wrap break-all">
            {parts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? 'bg-emerald-100 text-emerald-900'
                    : part.removed
                      ? 'bg-red-100 text-red-900 line-through'
                      : ''
                }
              >
                {part.value}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
