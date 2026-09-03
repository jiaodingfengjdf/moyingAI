'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import SnapshotDiff from './SnapshotDiff';
import type { AIRequest, ChapterSnapshot, ChapterWithVolume } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  chapter: ChapterWithVolume | null;
  saveState: string;
  wordCount: number;
  onRestored: () => void;
}

export default function InspectorPanel({ chapter, saveState, wordCount, onRestored }: Props) {
  const { data, isLoading, mutate } = useSWR<{ snapshots: ChapterSnapshot[] }>(
    chapter ? `/api/chapters/${chapter.id}/snapshots` : null,
    fetcher,
  );
  const { data: requestsData, mutate: mutateRequests } = useSWR<{ requests: AIRequest[] }>(
    chapter ? `/api/chapters/${chapter.id}/ai-requests` : null,
    fetcher,
  );
  const [diff, setDiff] = useState<ChapterSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<'restore' | 'delete' | null>(null);

  const snapshots = data?.snapshots ?? [];

  useEffect(() => {
    const handler = () => void mutateRequests();
    window.addEventListener('ai:adopted', handler);
    return () => window.removeEventListener('ai:adopted', handler);
  }, [mutateRequests]);

  async function createSnapshot() {
    if (!chapter) return;
    setBusy(true);
    try {
      await fetch(`/api/chapters/${chapter.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setLabel('');
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: ChapterSnapshot) {
    if (confirmingId !== s.id || confirmingAction !== 'restore') {
      setConfirmingId(s.id);
      setConfirmingAction('restore');
      return;
    }
    setConfirmingId(null);
    setConfirmingAction(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${s.id}/restore`, { method: 'POST' });
      if (res.ok) {
        setDiff(null);
        await mutate();
        onRestored();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ChapterSnapshot) {
    if (confirmingId !== s.id || confirmingAction !== 'delete') {
      setConfirmingId(s.id);
      setConfirmingAction('delete');
      return;
    }
    setConfirmingId(null);
    setConfirmingAction(null);
    await fetch(`/api/snapshots/${s.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <aside className="flex w-72 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-3 text-sm">
      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">本章信息</h3>
        <dl className="mt-2 space-y-1 text-gray-700">
          <div className="flex justify-between"><dt className="text-gray-500">字数</dt><dd>{wordCount}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">保存状态</dt><dd>{saveLabel(saveState)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">快照数</dt><dd>{snapshots.length}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">版本快照</h3>
        <div className="mt-2 flex gap-1">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createSnapshot();
            }}
            placeholder="快照标签（可选）"
            disabled={!chapter || busy}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          />
          <button
            onClick={() => void createSnapshot()}
            disabled={!chapter || busy}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            + 快照
          </button>
        </div>
        {isLoading && <p className="mt-2 text-gray-400">加载中…</p>}
        {!isLoading && snapshots.length === 0 && <p className="mt-2 text-gray-400">暂无快照</p>}
        <ul className="mt-2 space-y-2">
          {snapshots.map((s) => (
            <li key={s.id} className="rounded border border-gray-100 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">v{s.version}</span>
                <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              {s.label && <div className="text-xs text-gray-500">{s.label}</div>}
              <div className="mt-1 flex gap-2 text-xs">
                <button onClick={() => setDiff(s)} className="text-blue-600 hover:underline">对比</button>
                <button
                  onClick={() => void restore(s)}
                  disabled={busy}
                  className={confirmingId === s.id && confirmingAction === 'restore' ? 'text-red-600' : 'text-emerald-600 hover:underline'}
                >
                  {confirmingId === s.id && confirmingAction === 'restore' ? '确认回滚?' : '回滚'}
                </button>
                <button
                  onClick={() => void remove(s)}
                  disabled={busy}
                  className={confirmingId === s.id && confirmingAction === 'delete' ? 'text-red-600' : 'text-red-500 hover:underline'}
                >
                  {confirmingId === s.id && confirmingAction === 'delete' ? '确认删?' : '删除'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">AI 建议历史</h3>
        {(requestsData?.requests ?? []).length === 0 && <p className="mt-1 text-xs text-gray-400">暂无记录</p>}
        <ul className="mt-1 space-y-1">
          {(requestsData?.requests ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs text-gray-600">
              <span>{kindLabel(r.kind)} · {r.model}</span>
              <span className={r.accepted ? 'text-emerald-600' : 'text-gray-400'}>{r.accepted ? '已采纳' : '未采纳'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-300">
        <h3 className="font-medium">角色状态 · 信息差</h3>
        <p className="mt-1">M3 里程碑启用</p>
      </section>
      <section className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-300">
        <h3 className="font-medium">一致性警报</h3>
        <p className="mt-1">M3 里程碑启用</p>
      </section>

      {diff && chapter && (
        <SnapshotDiff current={chapter.content} snapshot={diff} onClose={() => setDiff(null)} />
      )}
    </aside>
  );
}

function saveLabel(state: string): string {
  switch (state) {
    case 'pending':
      return '待保存';
    case 'saving':
      return '保存中…';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    default:
      return '就绪';
  }
}

function kindLabel(kind: string): string {
  if (kind === 'ghostwrite') return '伴写';
  if (kind === 'rewrite') return '润色';
  return kind;
}
