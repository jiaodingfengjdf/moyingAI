'use client';

import { useState } from 'react';
import type { ChapterWithVolume, Volume } from '@/lib/types';
import EntityPanel from './EntityPanel';
import ForeshadowingPanel from './ForeshadowingPanel';

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
  const [error, setError] = useState('');
  const [creatingVolume, setCreatingVolume] = useState(false);
  const [newVolumeTitle, setNewVolumeTitle] = useState('');
  const [creatingForVolume, setCreatingForVolume] = useState<string | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [renamingVolumeId, setRenamingVolumeId] = useState<string | null>(null);
  const [renamingVolumeTitle, setRenamingVolumeTitle] = useState('');
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
  const [renamingChapterTitle, setRenamingChapterTitle] = useState('');
  const [confirmingVolumeId, setConfirmingVolumeId] = useState<string | null>(null);
  const [confirmingChapterId, setConfirmingChapterId] = useState<string | null>(null);

  async function call(url: string, options?: RequestInit) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '操作失败');
        return null;
      }
      await onChanged();
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function submitVolume() {
    const title = newVolumeTitle.trim();
    if (!title) return;
    await call(`/api/projects/${projectId}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setNewVolumeTitle('');
    setCreatingVolume(false);
  }

  async function submitChapter(volumeId: string) {
    const title = newChapterTitle.trim();
    if (!title) return;
    const json = await call(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volumeId, title }),
    });
    setNewChapterTitle('');
    setCreatingForVolume(null);
    if (json?.chapter?.id) onSelect(json.chapter.id);
  }

  async function submitRenameVolume(id: string) {
    const title = renamingVolumeTitle.trim();
    if (!title) return;
    await call(`/api/volumes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setRenamingVolumeId(null);
  }

  async function submitRenameChapter(id: string) {
    const title = renamingChapterTitle.trim();
    if (!title) return;
    await call(`/api/chapters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setRenamingChapterId(null);
  }

  async function deleteVolume(v: Volume) {
    if (confirmingVolumeId !== v.id) {
      setConfirmingVolumeId(v.id);
      return;
    }
    setConfirmingVolumeId(null);
    await call(`/api/volumes/${v.id}`, { method: 'DELETE' });
  }

  async function deleteChapter(c: ChapterWithVolume) {
    if (confirmingChapterId !== c.id) {
      setConfirmingChapterId(c.id);
      return;
    }
    setConfirmingChapterId(null);
    await call(`/api/chapters/${c.id}`, { method: 'DELETE' });
  }

  return (
    <aside className="flex w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-gray-700">目录</h2>
        <button
          onClick={() => {
            setCreatingVolume((v) => !v);
            setError('');
          }}
          disabled={busy}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          + 卷
        </button>
      </div>
      {error && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p>}

      {creatingVolume && (
        <div className="mt-2 flex gap-1">
          <input
            autoFocus
            value={newVolumeTitle}
            onChange={(e) => setNewVolumeTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitVolume();
              if (e.key === 'Escape') setCreatingVolume(false);
            }}
            placeholder="卷标题"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
          />
          <button onClick={() => void submitVolume()} disabled={busy} className="text-emerald-600">确定</button>
          <button onClick={() => setCreatingVolume(false)} className="text-gray-400">取消</button>
        </div>
      )}

      {volumes.length === 0 && !creatingVolume && <p className="mt-2 text-xs text-gray-400">还没有卷，点「+ 卷」创建。</p>}
      {volumes.map((v) => (
        <div key={v.id} className="mt-2">
          {renamingVolumeId === v.id ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                autoFocus
                value={renamingVolumeTitle}
                onChange={(e) => setRenamingVolumeTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitRenameVolume(v.id);
                  if (e.key === 'Escape') setRenamingVolumeId(null);
                }}
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
              />
              <button onClick={() => void submitRenameVolume(v.id)} disabled={busy} className="text-emerald-600">存</button>
              <button onClick={() => setRenamingVolumeId(null)} className="text-gray-400">取</button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-100">
              <span className="font-medium">{v.title}</span>
              <span className="flex gap-1">
                <button
                  onClick={() => {
                    setCreatingForVolume(creatingForVolume === v.id ? null : v.id);
                    setNewChapterTitle('');
                  }}
                  disabled={busy}
                  className="text-gray-500 hover:text-blue-600"
                >
                  +章
                </button>
                <button
                  onClick={() => {
                    setRenamingVolumeId(v.id);
                    setRenamingVolumeTitle(v.title);
                  }}
                  disabled={busy}
                  className="text-gray-500 hover:text-blue-600"
                >
                  改
                </button>
                <button
                  onClick={() => void deleteVolume(v)}
                  disabled={busy}
                  className={confirmingVolumeId === v.id ? 'text-red-600' : 'text-gray-500 hover:text-red-600'}
                >
                  {confirmingVolumeId === v.id ? '确认删?' : '删'}
                </button>
              </span>
            </div>
          )}

          {creatingForVolume === v.id && (
            <div className="flex items-center gap-1 py-1 pl-6 pr-2">
              <input
                autoFocus
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitChapter(v.id);
                  if (e.key === 'Escape') setCreatingForVolume(null);
                }}
                placeholder="章节标题"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
              />
              <button onClick={() => void submitChapter(v.id)} disabled={busy} className="text-emerald-600">确定</button>
              <button onClick={() => setCreatingForVolume(null)} className="text-gray-400">取消</button>
            </div>
          )}

          {chapters
            .filter((c) => c.volumeId === v.id)
            .map((c) => (
              <div key={c.id}>
                {renamingChapterId === c.id ? (
                  <div className="flex items-center gap-1 py-1 pl-6 pr-2">
                    <input
                      autoFocus
                      value={renamingChapterTitle}
                      onChange={(e) => setRenamingChapterTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitRenameChapter(c.id);
                        if (e.key === 'Escape') setRenamingChapterId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
                    />
                    <button onClick={() => void submitRenameChapter(c.id)} disabled={busy} className="text-emerald-600">存</button>
                    <button onClick={() => setRenamingChapterId(null)} className="text-gray-400">取</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded py-1 pl-6 pr-2 hover:bg-gray-100">
                    <button
                      onClick={() => onSelect(c.id)}
                      className={`flex-1 truncate text-left ${c.id === currentChapterId ? 'text-blue-600' : 'text-gray-700'}`}
                    >
                      {c.title}
                    </button>
                    <span className="flex gap-1">
                      <button
                        onClick={() => {
                          setRenamingChapterId(c.id);
                          setRenamingChapterTitle(c.title);
                        }}
                        disabled={busy}
                        className="text-gray-400 hover:text-blue-600"
                      >
                        改
                      </button>
                      <button
                        onClick={() => void deleteChapter(c)}
                        disabled={busy}
                        className={confirmingChapterId === c.id ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}
                      >
                        {confirmingChapterId === c.id ? '确认删?' : '删'}
                      </button>
                    </span>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
      <EntityPanel projectId={projectId} />
      <ForeshadowingPanel projectId={projectId} />
    </aside>
  );
}
