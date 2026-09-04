'use client';

import { useState } from 'react';
import type { ComplianceHit } from '@/lib/compliance/terms';

interface Row {
  chapterId: string;
  title: string;
  wordCount: number;
  hits: ComplianceHit[];
}

export default function ComplianceModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<{ scanned: number; hitChapters: number; totalHits: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function scan() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/compliance-scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '扫描失败');
        return;
      }
      setRows(json.results as Row[]);
      setSummary({ scanned: json.scanned, hitChapters: json.hitChapters, totalHits: json.totalHits });
    } finally {
      setBusy(false);
    }
  }

  async function copyReport() {
    if (!rows) return;
    const text = rows.map((r) => `【${r.title}】${r.hits.map((h) => `${h.term}×${h.count}（${h.category}）`).join('、')}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError('复制失败');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">合规扫描</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => void scan()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? '扫描中…' : '扫描全项目'}
          </button>
          {summary && <span className="text-xs text-gray-500">扫描 {summary.scanned} 章，命中 {summary.hitChapters} 章 / {summary.totalHits} 处</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto text-xs">
          {rows === null && <p className="text-gray-400">点击「扫描全项目」开始。</p>}
          {rows?.length === 0 && <p className="text-emerald-600">未发现命中词条。</p>}
          {rows?.map((r) => (
            <div key={r.chapterId} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{r.title}</span>
                <span className="text-gray-400">{r.wordCount} 字</span>
              </div>
              {r.hits.map((h, i) => (
                <div key={i} className="mt-1 rounded bg-red-50 px-2 py-1">
                  <span className="mr-2 rounded bg-red-200 px-1 text-red-800">{h.category}</span>
                  <span className="font-medium text-red-700">{h.term}</span>
                  <span className="ml-1 text-gray-500">×{h.count}</span>
                  <p className="mt-0.5 text-gray-500">{h.snippets.join(' … ')}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        {rows && rows.length > 0 && (
          <div className="mt-3 flex justify-end">
            <button onClick={() => void copyReport()} className="text-xs text-blue-600">{copied ? '已复制' : '复制报告'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
