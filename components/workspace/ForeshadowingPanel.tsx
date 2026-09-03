'use client';

import { useState } from 'react';
import useSWR from 'swr';
import ForeshadowingForm from './ForeshadowingForm';
import type { Foreshadowing } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const STATUS_LABELS: Record<Foreshadowing['status'], string> = {
  planting: '埋设',
  simmering: '发酵',
  payoff: '已回收',
};

export default function ForeshadowingPanel({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<{ foreshadowing: Foreshadowing[] }>(`/api/projects/${projectId}/foreshadowing`, fetcher);
  const [editing, setEditing] = useState<Foreshadowing | 'new' | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const list = data?.foreshadowing ?? [];

  async function remove(f: Foreshadowing) {
    if (confirmingId !== f.id) {
      setConfirmingId(f.id);
      return;
    }
    setConfirmingId(null);
    await fetch(`/api/foreshadowing/${f.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-500">伏笔跟踪</h3>
        <button onClick={() => setEditing('new')} className="text-blue-600">+ 伏笔</button>
      </div>
      {list.length === 0 && <p className="mt-1 text-xs text-gray-300">暂无伏笔</p>}
      <ul className="mt-1 space-y-1">
        {list.map((f) => (
          <li key={f.id} className={`rounded px-2 py-1 ${f.overdue ? 'bg-amber-50' : ''}`}>
            <div className="flex items-center justify-between gap-1">
              <button onClick={() => setEditing(f)} className="min-w-0 flex-1 truncate text-left text-gray-700">
                {f.title}
              </button>
              <button
                onClick={() => void remove(f)}
                className={confirmingId === f.id ? 'shrink-0 text-red-600' : 'shrink-0 text-gray-400 hover:text-red-600'}
              >
                {confirmingId === f.id ? '确认删?' : '删'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 pl-1 text-xs text-gray-400">
              <span>{STATUS_LABELS[f.status]}</span>
              {f.simmerRangeStart != null && <span>回收区间 {f.simmerRangeStart}~{f.simmerRangeEnd ?? '∞'}</span>}
              {f.payoffChapterTitle && <span>回收于 {f.payoffChapterTitle}</span>}
              {f.overdue && <span className="font-medium text-amber-600">⚠ 遗忘伏笔</span>}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <ForeshadowingForm
          projectId={projectId}
          foreshadowing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
