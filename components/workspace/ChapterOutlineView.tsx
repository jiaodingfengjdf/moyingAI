'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAutosave } from '@/lib/useAutosave';
import { BEAT_TEMPLATES, templateFirstChapterBeats } from '@/lib/beats/templates';
import type { Beat } from '@/lib/beats/templates';
import type { ChapterWithVolume, Scene } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  chapter: ChapterWithVolume;
  onOutlineSaved: () => void;
}

interface SceneDraft {
  title: string;
  goal: string;
  points: string;
}

const EMPTY_DRAFT: SceneDraft = { title: '', goal: '', points: '' };

export default function ChapterOutlineView({ chapter, onOutlineSaved }: Props) {
  const [outline, setOutline] = useState(chapter.outline);
  const [editing, setEditing] = useState<Scene | 'new' | null>(null);
  const [draft, setDraft] = useState<SceneDraft>(EMPTY_DRAFT);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [templateId, setTemplateId] = useState(BEAT_TEMPLATES[0].id);
  const [templateMsg, setTemplateMsg] = useState('');
  const [genGoal, setGenGoal] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<Beat[] | null>(null);
  const { data, mutate } = useSWR<{ scenes: Scene[] }>(`/api/chapters/${chapter.id}/scenes`, fetcher);
  const scenes = data?.scenes ?? [];

  const autosave = useAutosave(async (value: string) => {
    const res = await fetch(`/api/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline: value }),
    });
    if (!res.ok) throw new Error('大纲保存失败');
    onOutlineSaved();
  });

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setEditing('new');
    setError('');
  }

  function openEdit(scene: Scene) {
    setDraft({ title: scene.title, goal: scene.goal, points: scene.points });
    setEditing(scene);
    setError('');
  }

  async function saveScene() {
    if (!draft.title.trim()) {
      setError('标题不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const url = editing === 'new' ? `/api/chapters/${chapter.id}/scenes` : editing ? `/api/scenes/${editing.id}` : '';
      const method = editing === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, title: draft.title.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(scene: Scene) {
    await fetch(`/api/scenes/${scene.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: scene.status === 'done' ? 'draft' : 'done' }),
    });
    await mutate();
  }

  async function remove(scene: Scene) {
    if (confirmingId !== scene.id) {
      setConfirmingId(scene.id);
      return;
    }
    setConfirmingId(null);
    await fetch(`/api/scenes/${scene.id}`, { method: 'DELETE' });
    await mutate();
  }

  async function applyChapterTemplate() {
    const template = BEAT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const beats = templateFirstChapterBeats(template);
    setBusy(true);
    setTemplateMsg('');
    try {
      const res = await fetch('/api/beats/apply-chapter-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, beats }),
      });
      if (!res.ok) return;
      setTemplateMsg(`已按「${template.name}」添加 ${beats.length} 个场景卡`);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function generateBeats() {
    if (!genGoal.trim()) return;
    setGenLoading(true);
    setGenError('');
    setPreview(null);
    try {
      const res = await fetch('/api/ai/outline-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'chapter', chapterId: chapter.id, prompt: genGoal.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(json.error ?? '生成失败');
        return;
      }
      setPreview((json.payload?.beats as Beat[]) ?? []);
    } finally {
      setGenLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview || preview.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/beats/apply-chapter-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, beats: preview }),
      });
      if (res.ok) {
        setTemplateMsg(`已应用 AI 骨架，添加 ${preview.length} 个场景卡`);
        setPreview(null);
        setGenGoal('');
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-8 py-6 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">本章大纲 · {chapter.title}</h3>
        <span className="text-xs text-gray-400">大纲{autosaveLabel(autosave.state)}</span>
      </div>
      <textarea
        value={outline}
        onChange={(e) => {
          setOutline(e.target.value);
          autosave.schedule(e.target.value);
        }}
        rows={6}
        placeholder="本章要完成什么：核心事件、情绪走向、钩子……"
        className="mt-3 w-full rounded border border-gray-300 px-3 py-2 leading-6"
      />

      <div className="mt-5 flex items-center justify-between">
        <h4 className="font-medium text-gray-700">场景卡（{scenes.length}）</h4>
        <button onClick={openNew} disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
          + 场景
        </button>
      </div>
      <div className="mt-3 rounded border border-dashed border-gray-200 p-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
            {BEAT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => void applyChapterTemplate()} disabled={busy} className="text-blue-600 hover:underline disabled:text-gray-300">
            应用章模板
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={() => void generateBeats()} disabled={busy || genLoading} className="text-blue-600 hover:underline disabled:text-gray-300">
            AI 生成场景骨架
          </button>
        </div>
        {templateMsg && <p className="mt-1 text-xs text-emerald-600">{templateMsg}</p>}
        {genLoading && <p className="mt-1 text-xs text-amber-500">生成中…</p>}
        {genError && <p className="mt-1 text-xs text-red-600">{genError}</p>}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={genGoal}
            onChange={(e) => setGenGoal(e.target.value)}
            placeholder="本章目标（AI 生成用，可选）"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
          />
        </div>
        {preview && (
          <div className="mt-2 rounded bg-gray-50 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">预览：{preview.length} 个场景</span>
              <span className="flex gap-2">
                <button onClick={() => void applyPreview()} disabled={busy} className="text-emerald-600 hover:underline">应用</button>
                <button onClick={() => setPreview(null)} className="text-gray-400 hover:underline">放弃</button>
              </span>
            </div>
            <ul className="mt-1 space-y-1 text-xs text-gray-600">
              {preview.map((b, i) => (
                <li key={i}><span className="font-medium">{b.title}</span>：{b.goal}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {editing && (
        <div className="mt-3 space-y-2 rounded border border-gray-200 p-3">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="场景标题"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <textarea
            value={draft.goal}
            onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
            rows={2}
            placeholder="本场景目标"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <textarea
            value={draft.points}
            onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))}
            rows={2}
            placeholder="要点（可多行）"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setEditing(null); setDraft(EMPTY_DRAFT); }} className="text-gray-500">取消</button>
            <button onClick={() => void saveScene()} disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">保存</button>
          </div>
        </div>
      )}

      {scenes.length === 0 && !editing && <p className="mt-2 text-xs text-gray-400">暂无场景卡，点「+ 场景」添加。</p>}
      <ul className="mt-3 space-y-2">
        {scenes.map((s, index) => (
          <li key={s.id} className="flex items-start justify-between gap-2 rounded border border-gray-100 p-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{index + 1}.</span>
                <span className={`font-medium ${s.status === 'done' ? 'text-gray-400 line-through' : ''}`}>{s.title}</span>
                <button onClick={() => void toggleStatus(s)} className="text-xs text-gray-400 hover:text-emerald-600" title="切换完成状态">
                  {s.status === 'done' ? '✓ 已完成' : '○ 未完成'}
                </button>
              </div>
              {s.goal && <p className="mt-1 text-xs text-gray-600">目标：{s.goal}</p>}
              {s.points && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-400">{s.points}</p>}
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline">编辑</button>
              <button
                onClick={() => void remove(s)}
                className={confirmingId === s.id ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}
              >
                {confirmingId === s.id ? '确认删?' : '删'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function autosaveLabel(state: string): string {
  if (state === 'pending' || state === 'saving') return ' · 保存中…';
  if (state === 'error') return ' · 保存失败';
  return '';
}
