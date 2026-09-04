'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { diffLines } from 'diff';
import type { ChapterSnapshot } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TimeMachineModal({
  chapterId,
  currentContent,
  onClose,
  onForked,
}: {
  chapterId: string;
  currentContent: string;
  onClose: () => void;
  onForked: (chapterId: string) => void;
}) {
  const { data, mutate, isLoading } = useSWR<{ snapshots: ChapterSnapshot[] }>(`/api/chapters/${chapterId}/snapshots`, fetcher);
  const snapshots = data?.snapshots ?? [];
  const groups = [...new Set(snapshots.map((s) => s.branchId ?? '主线'))];
  const [confirming, setConfirming] = useState<{ id: string; action: 'restore' | 'delete' } | null>(null);
  const [compare, setCompare] = useState<ChapterSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run(s: ChapterSnapshot, action: 'restore' | 'delete') {
    if (!confirming || confirming.id !== s.id || confirming.action !== action) {
      setConfirming({ id: s.id, action });
      return;
    }
    setConfirming(null);
    setBusy(true);
    try {
      const res = await fetch(action === 'restore' ? `/api/snapshots/${s.id}/restore` : `/api/snapshots/${s.id}`, { method: action === 'restore' ? 'POST' : 'DELETE' });
      if (res.ok) {
        setMsg(action === 'restore' ? `已回滚到 v${s.version}` : `已删除 v${s.version}`);
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function fork(s: ChapterSnapshot) {
    setBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${s.id}/fork`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`已从 v${s.version} 创建分支草稿`);
        await mutate();
        onForked((json.chapter as { id: string }).id);
      }
    } finally {
      setBusy(false);
    }
  }

  const parts = compare ? diffLines(compare.content, currentContent) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">时光机 · 分支与版本</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-400">加载中…</p>}
          {groups.map((branch) => (
            <div key={branch} className="mb-3">
              <h4 className="text-xs font-medium text-gray-500">分支 · {branch}</h4>
              <ul className="mt-1 space-y-2">
                {snapshots.filter((s) => (s.branchId ?? '主线') === branch).map((s) => (
                  <li key={s.id} className="rounded border border-gray-100 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{s.version}</span>
                      <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    {s.label && <div className="text-xs text-gray-500">备注：{s.label}</div>}
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <button onClick={() => setCompare(compare?.id === s.id ? null : s)} className="text-blue-600 hover:underline">
                        {compare?.id === s.id ? '收起对比' : '对比当前'}
                      </button>
                      <button onClick={() => void run(s, 'restore')} disabled={busy} className={confirming?.id === s.id && confirming.action === 'restore' ? 'text-red-600' : 'text-emerald-600 hover:underline'}>
                        {confirming?.id === s.id && confirming.action === 'restore' ? '确认回滚?' : '回滚'}
                      </button>
                      <button onClick={() => void fork(s)} disabled={busy} className="text-purple-600 hover:underline">复制为新章草稿</button>
                      <button onClick={() => void run(s, 'delete')} disabled={busy} className={confirming?.id === s.id && confirming.action === 'delete' ? 'text-red-600' : 'text-red-500 hover:underline'}>
                        {confirming?.id === s.id && confirming.action === 'delete' ? '确认删?' : '删除'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!isLoading && snapshots.length === 0 && <p className="text-sm text-gray-400">暂无快照，先在右栏创建一个。</p>}
          {compare && (
            <div className="mt-2 rounded border border-gray-200 p-2">
              <h5 className="text-xs font-medium text-gray-600">v{compare.version}（左/红删） vs 当前（绿增）</h5>
              <pre className="mt-1 whitespace-pre-wrap break-all text-xs leading-5">
                {parts.map((part, i) => (
                  <span key={i} className={part.added ? 'bg-emerald-100 text-emerald-900' : part.removed ? 'bg-red-100 text-red-900 line-through' : ''}>
                    {part.value}
                  </span>
                ))}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
