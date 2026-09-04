'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import type { ProjectWithCounts } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProjectList() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ projects: ProjectWithCounts[] }>('/api/projects', fetcher);
  const [title, setTitle] = useState('');
  const [penName, setPenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, penName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '创建失败');
        return;
      }
      setTitle('');
      setPenName('');
      await mutate();
      router.push(`/projects/${json.project.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setConfirmingId(null);
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (res.ok) await mutate();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">墨影 AI</h1>
      <p className="mt-1 text-sm text-gray-500">智能小说创作工作台 · 数据本地存储于 data/ 目录</p>

      <form onSubmit={create} className="mt-8 flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          项目名
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="例如：九天仙帝"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          笔名（可选）
          <input
            value={penName}
            onChange={(e) => setPenName(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="作者名"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="w-fit rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {creating ? '创建中…' : '创建项目'}
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {isLoading && <p className="text-gray-500">加载中…</p>}
        {(data?.projects ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <button className="text-left" onClick={() => router.push(`/projects/${p.id}`)}>
              <div className="font-medium">{p.title}</div>
              <div className="mt-1 text-xs text-gray-500">
                {p.penName ? `${p.penName} · ` : ''}
                {p.volumeCount} 卷 / {p.chapterCount} 章 · 更新于 {new Date(p.updatedAt).toLocaleString('zh-CN')}
              </div>
            </button>
            <button
              onClick={() => void remove(p.id)}
              onBlur={() => setConfirmingId(null)}
              className={`text-sm hover:underline ${confirmingId === p.id ? 'text-red-600' : 'text-red-600'}`}
            >
              {confirmingId === p.id ? '确认删除？此操作不可恢复' : '删除'}
            </button>
          </div>
        ))}
        {!isLoading && (data?.projects ?? []).length === 0 && (
          <p className="text-gray-500">还没有项目，先创建一个开始写作吧。</p>
        )}
      </div>
    </main>
  );
}
