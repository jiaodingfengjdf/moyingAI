'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { ChapterWithVolume, Entity, Foreshadowing, ForeshadowingStatus } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const STATUSES: { value: ForeshadowingStatus; label: string }[] = [
  { value: 'planting', label: '埋设中' },
  { value: 'simmering', label: '发酵中' },
  { value: 'payoff', label: '已回收' },
];

interface Props {
  projectId: string;
  foreshadowing: Foreshadowing | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ForeshadowingForm({ projectId, foreshadowing, onClose, onSaved }: Props) {
  const { data: chaptersData } = useSWR<{ chapters: ChapterWithVolume[] }>(`/api/projects/${projectId}/chapters`, fetcher);
  const { data: entitiesData } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [title, setTitle] = useState(foreshadowing?.title ?? '');
  const [status, setStatus] = useState<ForeshadowingStatus>(foreshadowing?.status ?? 'planting');
  const [plantChapterId, setPlantChapterId] = useState(foreshadowing?.plantChapterId ?? '');
  const [simmerRangeStart, setSimmerRangeStart] = useState(foreshadowing?.simmerRangeStart?.toString() ?? '');
  const [simmerRangeEnd, setSimmerRangeEnd] = useState(foreshadowing?.simmerRangeEnd?.toString() ?? '');
  const [payoffChapterId, setPayoffChapterId] = useState(foreshadowing?.payoffChapterId ?? '');
  const [relatedIds, setRelatedIds] = useState<string[]>(foreshadowing?.relatedEntityIds ?? []);
  const [note, setNote] = useState(foreshadowing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chapters = chaptersData?.chapters ?? [];
  const entities = entitiesData?.entities ?? [];

  function toggleEntity(id: string) {
    setRelatedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save() {
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(foreshadowing ? `/api/foreshadowing/${foreshadowing.id}` : `/api/projects/${projectId}/foreshadowing`, {
        method: foreshadowing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          status,
          plantChapterId: plantChapterId || null,
          simmerRangeStart: simmerRangeStart ? Number(simmerRangeStart) : null,
          simmerRangeEnd: simmerRangeEnd ? Number(simmerRangeEnd) : null,
          payoffChapterId: payoffChapterId || null,
          relatedEntityIds: relatedIds,
          note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{foreshadowing ? '编辑伏笔' : '新建伏笔'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="伏笔标题（如：祖传玉佩）" className="w-full rounded border border-gray-300 px-2 py-1" />
          <div className="flex gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as ForeshadowingStatus)} className="rounded border border-gray-300 px-2 py-1">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={plantChapterId} onChange={(e) => setPlantChapterId(e.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1">
              <option value="">埋设章节（无）</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.volumeTitle}·{c.title}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">回收区间</span>
            <input value={simmerRangeStart} onChange={(e) => setSimmerRangeStart(e.target.value)} placeholder="起（章序号）" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
            <span>~</span>
            <input value={simmerRangeEnd} onChange={(e) => setSimmerRangeEnd(e.target.value)} placeholder="止（章序号）" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
          </div>
          <select value={payoffChapterId} onChange={(e) => setPayoffChapterId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">回收章节（无）</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.volumeTitle}·{c.title}</option>)}
          </select>
          <div>
            <span className="text-gray-500">关联实体</span>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
              {entities.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={relatedIds.includes(e.id)} onChange={() => toggleEntity(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="备注" className="w-full rounded border border-gray-300 px-2 py-1" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
          <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  );
}
