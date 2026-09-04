'use client';

import { useState } from 'react';
import { BEAT_TEMPLATES, templateToVolumeSkeleton } from '@/lib/beats/templates';
import type { SkeletonPayload } from '@/lib/beats/templates';
import type { ConsistencyIssue, Volume } from '@/lib/types';

interface Props {
  projectId: string;
  volume: Volume;
  onClose: () => void;
  onChanged: () => void;
}

export default function VolumeOutlineModal({ projectId, volume, onClose, onChanged }: Props) {
  const [summary, setSummary] = useState(volume.summary);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [templateId, setTemplateId] = useState(BEAT_TEMPLATES[0].id);
  const [templateMsg, setTemplateMsg] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<SkeletonPayload | null>(null);
  const [checkIssues, setCheckIssues] = useState<ConsistencyIssue[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkSkipped, setCheckSkipped] = useState('');

  async function saveSummary() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/volumes/${volume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      setSaved(true);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate() {
    const template = BEAT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const skeleton = templateToVolumeSkeleton(template);
    setBusy(true);
    setTemplateMsg('');
    try {
      const res = await fetch('/api/beats/apply-skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, volumeId: volume.id, skeleton }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '应用失败');
        return;
      }
      setTemplateMsg(`已按「${template.name}」生成 ${json.chapterCount} 章 / ${json.sceneCount} 场景`);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function generateVolume() {
    if (!genPrompt.trim()) return;
    setGenLoading(true);
    setGenError('');
    setPreview(null);
    try {
      const res = await fetch('/api/ai/outline-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'volume', volumeId: volume.id, prompt: genPrompt.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(json.error ?? '生成失败');
        return;
      }
      setPreview(json.payload as SkeletonPayload);
    } finally {
      setGenLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch('/api/beats/apply-skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, volumeId: volume.id, skeleton: preview }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setTemplateMsg(`已应用 AI 骨架：${json.chapterCount} 章 / ${json.sceneCount} 场景`);
        setPreview(null);
        setGenPrompt('');
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function runVolumeCheck() {
    setCheckLoading(true);
    try {
      const res = await fetch('/api/ai/outline-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumeId: volume.id }),
      });
      const json = await res.json().catch(() => ({}));
      setCheckIssues((json.issues as ConsistencyIssue[]) ?? []);
      setCheckSkipped(json.aiSkipped ?? '');
    } finally {
      setCheckLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">卷大纲 · {volume.title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <label className="flex flex-col gap-1 text-sm">
            卷大纲
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setSaved(false);
              }}
              rows={14}
              placeholder="本卷主线、情绪曲线、结局落点……"
              className="rounded border border-gray-300 px-3 py-2 leading-6"
            />
          </label>
          <div className="mt-3 rounded border border-dashed border-gray-200 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
                {BEAT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={() => void applyTemplate()} disabled={busy} className="text-blue-600 hover:underline disabled:text-gray-300">应用卷模板</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => void generateVolume()} disabled={busy || genLoading} className="text-blue-600 hover:underline disabled:text-gray-300">AI 生成卷骨架</button>
            </div>
            {templateMsg && <p className="mt-1 text-emerald-600">{templateMsg}</p>}
            {genLoading && <p className="mt-1 text-amber-500">生成中…</p>}
            {genError && <p className="mt-1 text-red-600">{genError}</p>}
            <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="卷目标（AI 生成用）" className="mt-2 w-full rounded border border-gray-300 px-2 py-1" />
            {preview && (
              <div className="mt-2 rounded bg-gray-50 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-600">预览：{preview.chapters.length} 章（卷大纲{preview.volumeOutline ? '已含' : '为空'}）</span>
                  <span className="flex gap-2">
                    <button onClick={() => void applyPreview()} disabled={busy} className="text-emerald-600 hover:underline">应用</button>
                    <button onClick={() => setPreview(null)} className="text-gray-400 hover:underline">放弃</button>
                  </span>
                </div>
                {preview.volumeOutline && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-gray-500">{preview.volumeOutline}</p>}
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {saved && <p className="mt-2 text-xs text-emerald-600">已保存</p>}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">卷逻辑预演</h4>
              <button onClick={() => void runVolumeCheck()} disabled={checkLoading} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
                {checkLoading ? '检查中…' : '预演'}
              </button>
            </div>
            {checkSkipped && <p className="mt-1 text-xs text-amber-600">{checkSkipped}</p>}
            {checkIssues.length === 0 && !checkLoading && <p className="mt-1 text-xs text-gray-400">未发现问题</p>}
            <ul className="mt-1 space-y-2">
              {checkIssues.map((issue, i) => (
                <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                  <span className="font-medium text-amber-800">{issue.type}</span>
                  <span className="ml-2 text-gray-500">{issue.text}</span>
                  <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>
                  <p className="text-gray-600">建议：{issue.suggestion}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
          <button onClick={() => void saveSummary()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
            保存大纲
          </button>
        </div>
      </div>
    </div>
  );
}
