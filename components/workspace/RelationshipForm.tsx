'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Entity, Relationship } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  projectId: string;
  relationship: Relationship | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RelationshipForm({ projectId, relationship, onClose, onSaved }: Props) {
  const { data } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [fromEntityId, setFromEntityId] = useState(relationship?.fromEntityId ?? '');
  const [toEntityId, setToEntityId] = useState(relationship?.toEntityId ?? '');
  const [type, setType] = useState(relationship?.type ?? '从属');
  const [strength, setStrength] = useState(relationship?.strength ?? 0);
  const [note, setNote] = useState(relationship?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entities = data?.entities ?? [];

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(relationship ? `/api/relationships/${relationship.id}` : `/api/projects/${projectId}/relationships`, {
        method: relationship ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEntityId, toEntityId, type, strength, note }),
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
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{relationship ? '编辑关系' : '新建关系'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <select value={fromEntityId} onChange={(e) => setFromEntityId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">选择实体 A</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={toEntityId} onChange={(e) => setToEntityId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">选择实体 B</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input value={type} onChange={(e) => setType(e.target.value)} placeholder="关系类型（恋人/宿敌/师徒…）" className="w-full rounded border border-gray-300 px-2 py-1" />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            好感度：{strength}（-100 敌视 ~ +100 亲密）
            <input type="range" min={-100} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" className="w-full rounded border border-gray-300 px-2 py-1" />
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
