'use client';

import { useRef, useState } from 'react';
import type { ChapterWithVolume, Volume } from '@/lib/types';
import EntityPanel from './EntityPanel';
import ForeshadowingPanel from './ForeshadowingPanel';
import VolumeOutlineModal from './VolumeOutlineModal';
import ProjectOutlineModal from './ProjectOutlineModal';

interface SearchHit {
  id: string;
  title: string;
  snippet: string;
  volumeTitle: string;
}

interface Props {
  projectId: string;
  projectTitle: string;
  volumes: Volume[];
  chapters: ChapterWithVolume[];
  currentChapterId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
  flushPending: () => Promise<void>;
}

export default function Sidebar({ projectId, projectTitle, volumes, chapters, currentChapterId, onSelect, onChanged, flushPending }: Props) {
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
  const [outlineVolume, setOutlineVolume] = useState<Volume | null>(null);
  const [bookOutlineOpen, setBookOutlineOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  function runSearch(q: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '检索失败');
        setSearchResults(json.hits as SearchHit[]);
      } catch (e) {
        setSearchError((e as Error).message);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function pickSearch(hit: SearchHit) {
    onSelect(hit.id);
    setSearchQuery('');
    setSearchResults(null);
  }

  async function call(url: string, options?: RequestInit) {
    await flushPending();
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
        <span className="flex gap-1">
          <button onClick={() => setBookOutlineOpen(true)} disabled={busy} title="全书总纲" className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
            总纲
          </button>
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
        </span>
      </div>
      <div className="mt-2">
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            runSearch(e.target.value);
          }}
          placeholder="检索正文/大纲…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
        {searching && <p className="mt-1 text-xs text-gray-400">检索中…</p>}
        {searchError && <p className="mt-1 text-xs text-red-500">{searchError}</p>}
        {searchResults && searchResults.length === 0 && !searching && <p className="mt-1 text-xs text-gray-400">无结果</p>}
        {searchResults && searchResults.length > 0 && (
          <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded border border-gray-100 bg-white p-1">
            {searchResults.map((h) => (
              <li key={h.id}>
                <button onClick={() => pickSearch(h)} className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100">
                  <span className="text-xs font-medium text-gray-700">{h.title}{h.volumeTitle ? `（${h.volumeTitle}）` : ''}</span>
                  <span className="block truncate text-xs text-gray-400">{h.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
                <button onClick={() => setOutlineVolume(v)} disabled={busy} title="卷大纲与节拍" className="text-gray-500 hover:text-blue-600">纲</button>
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
      {outlineVolume && (
        <VolumeOutlineModal
          projectId={projectId}
          volume={outlineVolume}
          onClose={() => setOutlineVolume(null)}
          onChanged={onChanged}
        />
      )}
      {bookOutlineOpen && (
        <ProjectOutlineModal
          projectId={projectId}
          projectTitle={projectTitle}
          onClose={() => setBookOutlineOpen(false)}
          onChanged={onChanged}
        />
      )}
    </aside>
  );
}
