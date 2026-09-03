'use client';

import { useState } from 'react';
import useSWR from 'swr';
import SnapshotDiff from './SnapshotDiff';
import type { ChapterSnapshot, ChapterWithVolume } from '@/lib/types';

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
  const [diff, setDiff] = useState<ChapterSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const snapshots = data?.snapshots ?? [];

  async function createSnapshot() {
    if (!chapter) return;
    const label = prompt('快照标签（可选）：');
    setBusy(true);
    try {
      await fetch(`/api/chapters/${chapter.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: ChapterSnapshot) {
    if (!confirm(`回滚到版本 v${s.version}${s.label ? `（${s.label}）` : ''}？回滚前会自动保存当前状态。`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${s.id}/restore`, { method: 'POST' });
      if (res.ok) {
        setDiff(null);
        onRestored();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ChapterSnapshot) {
    if (!confirm(`删除快照 v${s.version}？`)) return;
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
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">版本快照</h3>
          <button
            onClick={createSnapshot}
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
                <button onClick={() => restore(s)} disabled={busy} className="text-emerald-600 hover:underline">回滚</button>
                <button onClick={() => remove(s)} disabled={busy} className="text-red-500 hover:underline">删除</button>
              </div>
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
