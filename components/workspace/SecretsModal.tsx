'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { Entity, Secret } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  projectId: string;
  onClose: () => void;
}

function tempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SecretsModal({ projectId, onClose }: Props) {
  const { data: entityData } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [secrets, setSecrets] = useState<Secret[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const entities = entityData?.entities ?? [];

  async function refresh() {
    const res = await fetch(`/api/projects/${projectId}/secrets`);
    const json = await res.json().catch(() => ({ secrets: [] as Secret[] }));
    setSecrets(json.secrets as Secret[]);
    setModified(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function patchSecret(id: string, patch: Partial<Secret>) {
    setSecrets((prev) => prev?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? null);
    setModified(true);
  }

  function addSecret() {
    setModified(true);
    const now = new Date().toISOString();
    setSecrets((prev) => [
      {
        id: tempId(),
        projectId,
        title: '',
        detail: '',
        knownEntityIds: [],
        note: '',
        createdAt: now,
        updatedAt: now,
      },
      ...(prev ?? []),
    ]);
  }

  async function saveSecret(secret: Secret) {
    setBusyId(secret.id);
    setError('');
    setMsg('');
    const isNew = secret.id.startsWith('tmp-');
    try {
      const res = await fetch(isNew ? `/api/projects/${projectId}/secrets` : `/api/secrets/${secret.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: secret.title,
          detail: secret.detail,
          knownEntityIds: secret.knownEntityIds,
          note: secret.note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      setMsg('已保存');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeSecret(id: string) {
    if (id.startsWith('tmp-')) {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        return;
      }
      setConfirmDeleteId(null);
      setSecrets((prev) => prev?.filter((s) => s.id !== id) ?? null);
      return;
    }
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    await fetch(`/api/secrets/${id}`, { method: 'DELETE' });
    await refresh();
  }

  function toggleKnown(secretId: string, entityId: string) {
    setSecrets((prev) =>
      prev?.map((s) => {
        if (s.id !== secretId) return s;
        const known = s.knownEntityIds.includes(entityId)
          ? s.knownEntityIds.filter((id) => id !== entityId)
          : [...s.knownEntityIds, entityId];
        return { ...s, knownEntityIds: known };
      }) ?? null,
    );
    setModified(true);
  }

  function requestClose() {
    if (modified) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">秘密信息差矩阵</h3>
          <button onClick={requestClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          每个秘密是一行，勾选哪些实体当前知道它；未勾选的实体在写作时应对该秘密保持“不知道”。
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {secrets?.length ?? 0} 个秘密 · {entities.length} 个实体
          </span>
          <span className="flex gap-2">
            {msg && <span className="text-xs text-emerald-600">{msg}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button onClick={addSecret} className="rounded bg-blue-600 px-2 py-1 text-xs text-white">+ 秘密</button>
          </span>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-auto">
          {!secrets && <p className="text-sm text-gray-400">加载中…</p>}
          {secrets && secrets.length === 0 && <p className="mt-8 text-center text-sm text-gray-400">暂无秘密，点「+ 秘密」建立第一条信息差。</p>}
          {secrets && secrets.length > 0 && (
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="w-72 border-b border-gray-200 px-2 py-2 text-left align-bottom font-medium text-gray-500">秘密</th>
                  {entities.map((e) => (
                    <th key={e.id} className="border-b border-gray-200 px-1 py-2 align-bottom font-normal text-gray-400" title={`${e.name}（${e.type}）`}>
                      <span className="block max-w-20 truncate">{e.name}</span>
                    </th>
                  ))}
                  {entities.length === 0 && <th className="border-b border-gray-200 px-2 py-2 text-left font-normal text-gray-400">先创建实体后才能标记知情者</th>}
                </tr>
              </thead>
              <tbody>
                {secrets.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="border-b border-gray-100 p-2">
                      <input
                        value={s.title}
                        onChange={(e) => patchSecret(s.id, { title: e.target.value })}
                        placeholder="秘密标题，如：主角身世"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-medium"
                      />
                      <textarea
                        value={s.detail}
                        onChange={(e) => patchSecret(s.id, { detail: e.target.value })}
                        rows={2}
                        placeholder="秘密内容、揭晓时机建议……"
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={s.note}
                        onChange={(e) => patchSecret(s.id, { note: e.target.value })}
                        placeholder="备注（可选）"
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => void saveSecret(s)}
                          disabled={busyId === s.id || !s.title.trim()}
                          className="rounded bg-blue-600 px-2 py-0.5 text-white disabled:opacity-50"
                        >
                          {busyId === s.id ? '保存中…' : '保存'}
                        </button>
                        <button
                          onClick={() => void removeSecret(s.id)}
                          className={confirmDeleteId === s.id ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}
                        >
                          {confirmDeleteId === s.id ? '确认删?' : '删'}
                        </button>
                        {s.id.startsWith('tmp-') && <span className="text-amber-600">未保存</span>}
                      </div>
                    </td>
                    {entities.map((e) => {
                      const known = s.knownEntityIds.includes(e.id);
                      return (
                        <td key={e.id} className="border-b border-gray-100 px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={known}
                            onChange={() => toggleKnown(s.id, e.id)}
                            title={known ? `${e.name} 知道` : `${e.name} 不知道`}
                            className="h-4 w-4 accent-blue-600"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {confirmClose ? (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            信息差矩阵有未保存的修改，如何处理？
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-gray-600">放弃全部修改</button>
              <button onClick={() => setConfirmClose(false)} className="rounded border border-gray-300 px-3 py-1.5">继续编辑</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <p className="text-[10px] text-gray-400">
              {modified ? '有未保存修改，请逐行点「保存」。' : '所有修改均已落库。'}
            </p>
            <button onClick={requestClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
          </div>
        )}
      </div>
    </div>
  );
}
