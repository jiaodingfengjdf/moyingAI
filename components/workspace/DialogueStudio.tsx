'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { DialogueLine } from '@/lib/ai/dialogue';
import type { Entity } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DialogueStudio({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const characters = (data?.entities ?? []).filter((e) => e.type === 'character');
  const [selected, setSelected] = useState<string[]>([]);
  const [scenario, setScenario] = useState('');
  const [lines, setLines] = useState<DialogueLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  }

  async function generate() {
    setBusy(true);
    setError('');
    setLines(null);
    try {
      const res = await fetch('/api/ai/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, characterIds: selected, scenario }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '生成失败');
        return;
      }
      setLines(json.lines as DialogueLine[]);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!lines) return;
    const text = lines.map((l) => `${l.speaker}：${l.line}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError('复制失败，请手动选择');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">多角色对话演练</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="text-xs text-gray-500">选择角色（2~4，当前 {selected.length}）：</div>
          <div className="flex flex-wrap gap-2">
            {characters.map((c) => (
              <label key={c.id} className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} disabled={!selected.includes(c.id) && selected.length >= 4} />
                {c.name}
              </label>
            ))}
          </div>
          {characters.length < 2 && <p className="text-xs text-amber-600">至少需要 2 个人物角色，先在「实体档案馆」创建。</p>}
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            rows={3}
            placeholder="情境冲突，如：分赃不均且有第三者背叛"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={() => void generate()}
            disabled={busy || selected.length < 2 || !scenario.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
          >
            {busy ? '生成中…' : '生成对白'}
          </button>
          {lines && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>共 {lines.length} 句</span>
                <button onClick={() => void copy()} className="text-blue-600">{copied ? '已复制' : '复制全部'}</button>
              </div>
              <div className="mt-1 max-h-60 space-y-1 overflow-y-auto rounded bg-gray-50 p-2 text-xs">
                {lines.map((l, i) => (
                  <p key={i}><span className="font-medium text-blue-700">{l.speaker}：</span>{l.line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
