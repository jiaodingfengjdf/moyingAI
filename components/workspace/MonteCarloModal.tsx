'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Branch } from '@/lib/ai/monteCarlo';
import type { ChapterWithVolume, Scene } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MonteCarloModal({
  chapter,
  onClose,
  onOutlineChanged,
}: {
  chapter: ChapterWithVolume;
  onClose: () => void;
  onOutlineChanged: () => void;
}) {
  const { data } = useSWR<{ scenes: Scene[] }>(`/api/chapters/${chapter.id}/scenes`, fetcher);
  const [decision, setDecision] = useState('');
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const scenes = data?.scenes ?? [];
  const context = [chapter.outline, ...scenes.map((s) => `${s.title}：${s.goal}`)].filter(Boolean).join('\n');

  async function run() {
    if (!decision.trim()) return;
    setBusy(true);
    setError('');
    setBranches(null);
    try {
      const res = await fetch('/api/ai/monte-carlo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: chapter.projectId, chapterId: chapter.id, contextText: context, decision: decision.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '推演失败');
        return;
      }
      setBranches(json.branches as Branch[]);
    } finally {
      setBusy(false);
    }
  }

  async function applyOutline(b: Branch) {
    setBusy(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: `${b.title}：${b.immediate} 中期：${b.mid} 钩子：${b.hook}` }),
      });
      if (res.ok) {
        setMsg(`已把「${b.title}」设为本章大纲`);
        onOutlineChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg('已复制');
      setTimeout(() => setMsg(''), 1200);
    } catch {
      setError('复制失败，请手动选择');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">蒙特卡洛分支推演</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <input
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          placeholder="决策点，如：主角是否拔刀反杀？"
          className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {context && <p className="mt-2 max-h-20 overflow-y-auto text-xs text-gray-400">上下文：{context.replace(/\n/g, ' / ').slice(0, 400)}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => void run()} disabled={busy || !decision.trim()} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? '推演中…' : '推演'}
          </button>
          {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        {branches && (
          <div className="mt-3 grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {branches.map((b, i) => (
              <div key={i} className="rounded border border-gray-200 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{b.title}</span>
                  <span className="text-gray-400">{b.probability}</span>
                </div>
                <p className="mt-1 text-gray-600">即时：{b.immediate}</p>
                <p className="mt-0.5 text-gray-600">中期：{b.mid}</p>
                <p className="mt-0.5 text-red-500">风险：{b.risk}</p>
                <p className="mt-0.5 text-gray-500">钩子：{b.hook}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void applyOutline(b)} disabled={busy} className="text-blue-600 hover:underline">设为章大纲</button>
                  <button onClick={() => void copyText(`${b.title}：${b.immediate} 中期：${b.mid} 钩子：${b.hook}`)} className="text-gray-500 hover:underline">复制</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
