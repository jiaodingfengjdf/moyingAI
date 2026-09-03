'use client';

import { useState } from 'react';
import type { ChapterWithVolume, Volume } from '@/lib/types';

interface Props {
  projectId: string;
  volumes: Volume[];
  chapters: ChapterWithVolume[];
  currentChapterId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export default function Sidebar({ projectId, volumes, chapters, currentChapterId, onSelect, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function api(url: string, options?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? '操作失败');
        return null;
      }
      await onChanged();
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function addVolume() {
    const title = prompt('卷标题：');
    if (!title?.trim()) return;
    await api(`/api/projects/${projectId}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function renameVolume(v: Volume) {
    const title = prompt('新卷名：', v.title);
    if (!title?.trim() || title.trim() === v.title) return;
    await api(`/api/volumes/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function removeVolume(v: Volume) {
    if (!confirm(`删除卷「${v.title}」？其下所有章节与快照将一并删除。`)) return;
    await api(`/api/volumes/${v.id}`, { method: 'DELETE' });
  }

  async function addChapter(volumeId: string) {
    const title = prompt('章节标题：');
    if (!title?.trim()) return;
    const json = await api(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volumeId, title: title.trim() }),
    });
    if (json?.chapter?.id) onSelect(json.chapter.id);
  }

  async function renameChapter(c: ChapterWithVolume) {
    const title = prompt('新章节名：', c.title);
    if (!title?.trim() || title.trim() === c.title) return;
    await api(`/api/chapters/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function removeChapter(c: ChapterWithVolume) {
    if (!confirm(`删除章节「${c.title}」？其快照将一并删除。`)) return;
    await api(`/api/chapters/${c.id}`, { method: 'DELETE' });
  }

  return (
    <aside className="flex w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-gray-700">目录</h2>
        <button
          onClick={addVolume}
          disabled={busy}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          + 卷
        </button>
      </div>
      {volumes.length === 0 && <p className="mt-2 text-xs text-gray-400">还没有卷，点「+ 卷」创建。</p>}
      {volumes.map((v) => (
        <div key={v.id} className="mt-2">
          <div className="group flex items-center justify-between rounded px-2 py-1 hover:bg-gray-100">
            <span className="font-medium">{v.title}</span>
            <span className="hidden gap-1 group-hover:flex">
              <button onClick={() => addChapter(v.id)} disabled={busy} className="text-gray-500 hover:text-blue-600">+章</button>
              <button onClick={() => renameVolume(v)} disabled={busy} className="text-gray-500 hover:text-blue-600">改</button>
              <button onClick={() => removeVolume(v)} disabled={busy} className="text-gray-500 hover:text-red-600">删</button>
            </span>
          </div>
          {chapters
            .filter((c) => c.volumeId === v.id)
            .map((c) => (
              <div key={c.id} className="group flex items-center justify-between rounded py-1 pl-6 pr-2 hover:bg-gray-100">
                <button
                  onClick={() => onSelect(c.id)}
                  className={`flex-1 truncate text-left ${c.id === currentChapterId ? 'text-blue-600' : 'text-gray-700'}`}
                >
                  {c.title}
                </button>
                <span className="hidden gap-1 group-hover:flex">
                  <button onClick={() => renameChapter(c)} disabled={busy} className="text-gray-400 hover:text-blue-600">改</button>
                  <button onClick={() => removeChapter(c)} disabled={busy} className="text-gray-400 hover:text-red-600">删</button>
                </span>
              </div>
            ))}
        </div>
      ))}
      <div className="mt-6 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-medium text-gray-400">实体档案馆</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
        <h3 className="mt-3 text-xs font-medium text-gray-400">伏笔跟踪</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
      </div>
    </aside>
  );
}
