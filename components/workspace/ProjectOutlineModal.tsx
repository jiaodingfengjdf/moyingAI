'use client';

import { useEffect, useRef, useState } from 'react';
import type { BookArc, ConsistencyIssue, ProjectOutline } from '@/lib/types';

interface Props {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onChanged: () => void;
}

function newArcId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `arc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneArcs(arcs: BookArc[]): BookArc[] {
  return arcs.map((a) => ({ ...a }));
}

export default function ProjectOutlineModal({ projectId, projectTitle, onClose, onChanged }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [synopsis, setSynopsis] = useState('');
  const [theme, setTheme] = useState('');
  const [arcs, setArcs] = useState<BookArc[]>([]);
  const initialRef = useRef<{ synopsis: string; theme: string; arcs: BookArc[] }>({ synopsis: '', theme: '', arcs: [] });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [checkIssues, setCheckIssues] = useState<ConsistencyIssue[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkSkipped, setCheckSkipped] = useState('');

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/outline`)
      .then((r) => r.json())
      .then((d: { outline?: ProjectOutline }) => {
        const outline = d.outline;
        if (!outline) return;
        const snap = { synopsis: outline.synopsis, theme: outline.theme, arcs: cloneArcs(outline.arcs) };
        setSynopsis(snap.synopsis);
        setTheme(snap.theme);
        setArcs(snap.arcs);
        initialRef.current = snap;
        setLoaded(true);
      })
      .catch(() => setError('总纲加载失败'));
  }, [projectId]);

  const dirty = JSON.stringify({ synopsis, theme, arcs }) !== JSON.stringify(initialRef.current);

  async function save(thenClose = false) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ synopsis, theme, arcs }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      initialRef.current = { synopsis, theme, arcs: cloneArcs(arcs) };
      setSaved(true);
      await onChanged();
      if (thenClose) onClose();
    } finally {
      setBusy(false);
    }
  }

  function requestClose() {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmClose(true);
  }

  function addArc() {
    setArcs((prev) => [...prev, { id: newArcId(), title: '', goal: '', summary: '' }]);
    setSaved(false);
  }

  function patchArc(id: string, patch: Partial<BookArc>) {
    setArcs((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSaved(false);
  }

  function removeArc(id: string) {
    setArcs((prev) => prev.filter((a) => a.id !== id));
    setSaved(false);
  }

  async function runBookCheck() {
    setCheckLoading(true);
    setCheckSkipped('');
    setError('');
    try {
      const res = await fetch('/api/ai/outline-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '预演失败');
        return;
      }
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
          <h3 className="font-medium">全书总纲 · {projectTitle}</h3>
          <button onClick={requestClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {!loaded && <p className="text-sm text-gray-400">加载中…</p>}
          <label className="block text-sm">
            全书主线
            <textarea
              value={synopsis}
              onChange={(e) => {
                setSynopsis(e.target.value);
                setSaved(false);
              }}
              rows={7}
              placeholder="一句话到一段话：主角是谁、要达成什么、最大阻碍、结局落点、最终悬念……"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 leading-6"
            />
          </label>
          <label className="block text-sm">
            主题（可选）
            <input
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                setSaved(false);
              }}
              placeholder="本书想表达的主题，如：出身低微者靠心性而非血脉登顶"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="rounded border border-dashed border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">卷弧（可选，全书→卷的拆解）</span>
              <button onClick={addArc} className="text-xs text-blue-600 hover:underline">+ 卷弧</button>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">总纲之下先定每卷的使命，卷大纲再细化到章。</p>
            {arcs.length === 0 && <p className="mt-1 text-xs text-gray-400">暂无卷弧</p>}
            <div className="mt-2 space-y-2">
              {arcs.map((arc, i) => (
                <div key={arc.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">#{i + 1}</span>
                    <input
                      value={arc.title}
                      onChange={(e) => patchArc(arc.id, { title: e.target.value })}
                      placeholder="卷弧标题，如：第一卷·觉醒与立身"
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button onClick={() => removeArc(arc.id)} className="text-xs text-gray-400 hover:text-red-600">删</button>
                  </div>
                  <input
                    value={arc.goal}
                    onChange={(e) => patchArc(arc.id, { goal: e.target.value })}
                    placeholder="本卷目标：主角要获得/解决什么"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                  <textarea
                    value={arc.summary}
                    onChange={(e) => patchArc(arc.id, { summary: e.target.value })}
                    rows={2}
                    placeholder="卷内主线的起承转合（可选）"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {saved && <p className="text-xs text-emerald-600">已保存</p>}
          <div className="rounded border border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">全书逻辑预演</span>
              <button onClick={() => void runBookCheck()} disabled={checkLoading || busy} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
                {checkLoading ? '检查中…' : '预演'}
              </button>
            </div>
            {checkSkipped && <p className="mt-1 text-xs text-amber-600">{checkSkipped}</p>}
            {!checkLoading && checkIssues.length === 0 && <p className="mt-1 text-xs text-gray-400">尚未预演或未发现问题</p>}
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
        {confirmClose ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            总纲有未保存修改，如何处理？
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-gray-600">放弃修改</button>
              <button onClick={() => setConfirmClose(false)} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
              <button onClick={() => void save(true)} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存并关闭</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={requestClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
            <button onClick={() => void save()} disabled={busy || !loaded} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
              保存总纲
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
