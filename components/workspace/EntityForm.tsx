'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Entity, EntityTimelineEntry, EntityType } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const TYPES: { value: EntityType; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'faction', label: '阵营势力' },
  { value: 'location', label: '地点' },
  { value: 'system', label: '功法/体系' },
  { value: 'artifact', label: '道具/宝物' },
];

interface Props {
  projectId: string;
  entity: Entity | null;
  onClose: () => void;
  onSaved: () => void;
}

function parseChange(text: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const part of text.split(/[,，]/)) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key && value) obj[key] = value;
  }
  return obj;
}

function formatChange(change: Record<string, unknown>): string {
  return Object.entries(change).map(([k, v]) => `${k}=${String(v)}`).join(', ');
}

export default function EntityForm({ projectId, entity, onClose, onSaved }: Props) {
  const [type, setType] = useState<EntityType>(entity?.type ?? 'character');
  const [name, setName] = useState(entity?.name ?? '');
  const [aliasesText, setAliasesText] = useState((entity?.aliases ?? []).join('，'));
  const [description, setDescription] = useState(entity?.description ?? '');
  const [fieldRows, setFieldRows] = useState<{ key: string; value: string }[]>(
    Object.entries(entity?.fields ?? {}).map(([k, v]) => ({ key: k, value: String(v) })),
  );
  const [rulesText, setRulesText] = useState((entity?.rules ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: timelineData, mutate: mutateTimeline } = useSWR<{ timeline: EntityTimelineEntry[] }>(
    entity ? `/api/entities/${entity.id}/timeline` : null,
    fetcher,
  );
  const [changeText, setChangeText] = useState('');
  const [note, setNote] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    const fields: Record<string, unknown> = {};
    for (const row of fieldRows) {
      if (row.key.trim()) fields[row.key.trim()] = row.value;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(entity ? `/api/entities/${entity.id}` : `/api/projects/${projectId}/entities`, {
        method: entity ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: name.trim(),
          aliases: aliasesText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          description,
          fields,
          rules: rulesText.split('\n').map((s) => s.trim()).filter(Boolean),
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

  async function remove() {
    if (!entity || !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await fetch(`/api/entities/${entity.id}`, { method: 'DELETE' });
    onSaved();
  }

  async function addTimeline() {
    if (!entity) return;
    const change = parseChange(changeText);
    if (Object.keys(change).length === 0) return;
    setBusy(true);
    try {
      await fetch(`/api/entities/${entity.id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change, note }),
      });
      setChangeText('');
      setNote('');
      await mutateTimeline();
    } finally {
      setBusy(false);
    }
  }

  const timeline = timelineData?.timeline ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{entity ? `编辑实体：${entity.name}` : '新建实体'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as EntityType)} className="rounded border border-gray-300 px-2 py-1">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
          </div>
          <label className="flex flex-col gap-1">
            别名（逗号分隔）
            <input value={aliasesText} onChange={(e) => setAliasesText(e.target.value)} placeholder="小砚，林兄" className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">
            描述
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="外貌、性格、动机……" className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">结构化状态（键 = 值）</span>
              <button onClick={() => setFieldRows((rows) => [...rows, { key: '', value: '' }])} className="text-blue-600">+ 字段</button>
            </div>
            {fieldRows.map((row, i) => (
              <div key={i} className="mt-1 flex gap-1">
                <input
                  value={row.key}
                  onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  placeholder="境界"
                  className="w-1/3 rounded border border-gray-300 px-2 py-1"
                />
                <input
                  value={row.value}
                  onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  placeholder="炼气三层"
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
                />
                <button onClick={() => setFieldRows((rows) => rows.filter((_, j) => j !== i))} className="text-gray-400">✕</button>
              </div>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            校验规则（每行一条，如：不可复活）
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={2} className="rounded border border-gray-300 px-2 py-1" />
          </label>

          {entity && (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-xs font-medium text-gray-500">时间线（最近状态优先）</h4>
              <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-gray-600">
                {timeline.map((t) => (
                  <li key={t.id}>
                    <span className="font-medium">{formatChange(t.change)}</span>
                    {t.note ? ` · ${t.note}` : ''}
                    <span className="ml-1 text-gray-400">{new Date(t.createdAt).toLocaleString('zh-CN')}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1">
                <input value={changeText} onChange={(e) => setChangeText(e.target.value)} placeholder="状态变更，如：境界=筑基, 伤势=恢复" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" className="w-24 rounded border border-gray-300 px-2 py-1 text-xs" />
                <button onClick={() => void addTimeline()} disabled={busy} className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50">加</button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-between">
          {entity ? (
            <button
              onClick={() => void remove()}
              disabled={busy}
              className={confirmDelete ? 'text-red-600' : 'text-red-500 hover:underline'}
            >
              {confirmDelete ? '确认删除?' : '删除实体'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
            <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
