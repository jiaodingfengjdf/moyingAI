'use client';

import { useState } from 'react';
import type { Volume } from '@/lib/types';

interface Props {
  projectId: string;
  volume: Volume;
  onClose: () => void;
  onChanged: () => void;
}

export default function VolumeOutlineModal({ projectId: _projectId, volume, onClose, onChanged }: Props) {
  const [summary, setSummary] = useState(volume.summary);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {saved && <p className="mt-2 text-xs text-emerald-600">已保存</p>}
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
