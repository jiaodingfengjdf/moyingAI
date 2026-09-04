'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import SnapshotDiff from './SnapshotDiff';
import EmotionChart from './EmotionChart';
import TimeMachineModal from './TimeMachineModal';
import LiveEmotionPulse from './LiveEmotionPulse';
import SecretsModal from './SecretsModal';
import { emotionWarnings } from '@/lib/ai/emotion';
import type { AIRequest, ChapterSnapshot, ChapterWithVolume, ConsistencyIssue } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  chapter: ChapterWithVolume | null;
  liveText?: string;
  saveState: string;
  wordCount: number;
  autoCheck: boolean | null;
  onIssuesChange: (issues: ConsistencyIssue[]) => void;
  onRestored: () => void;
  onForked: (chapterId: string) => void;
}

export default function InspectorPanel({
  chapter,
  liveText = '',
  saveState,
  wordCount,
  autoCheck,
  onIssuesChange,
  onRestored,
  onForked,
}: Props) {
  const { data, isLoading, mutate } = useSWR<{ snapshots: ChapterSnapshot[] }>(
    chapter ? `/api/chapters/${chapter.id}/snapshots` : null,
    fetcher,
  );
  const { data: requestsData, mutate: mutateRequests } = useSWR<{ requests: AIRequest[] }>(
    chapter ? `/api/chapters/${chapter.id}/ai-requests` : null,
    fetcher,
  );
  const { data: statusData } = useSWR<{ status: Array<{ id: string; name: string; type: string; latest: Record<string, unknown>; latestNote: string }> }>(
    chapter ? `/api/projects/${chapter.projectId}/entity-status` : null,
    fetcher,
  );
  const { data: emotionData, mutate: mutateEmotion } = useSWR<{ rows: Array<{ chapterId: string; title: string; buildUp: number; anticipation: number; release: number; driver: string }> }>(
    chapter ? `/api/projects/${chapter.projectId}/emotion` : null,
    fetcher,
  );
  const [diff, setDiff] = useState<ChapterSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<'restore' | 'delete' | null>(null);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [aiSkipped, setAiSkipped] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [poisonIssues, setPoisonIssues] = useState<ConsistencyIssue[]>([]);
  const [poisonChecking, setPoisonChecking] = useState(false);
  const [emotionBusy, setEmotionBusy] = useState(false);
  const [emotionMsg, setEmotionMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const lastCheckedHash = useRef('');

  const snapshots = data?.snapshots ?? [];
  const emotionRows = emotionData?.rows ?? [];
  const currentAnalysis = emotionRows.find((r) => r.chapterId === chapter?.id) ?? null;
  const warnings = emotionWarnings(emotionRows);

  async function analyzeChapter() {
    if (!chapter) return;
    setEmotionBusy(true);
    setEmotionMsg('');
    try {
      const res = await fetch('/api/ai/emotion-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      if (res.ok) await mutateEmotion();
    } finally {
      setEmotionBusy(false);
    }
  }

  async function copyChapter() {
    if (!chapter) return;
    try {
      await navigator.clipboard.writeText(chapter.content || chapter.outline || '');
      setExportMsg('已复制');
      setTimeout(() => setExportMsg(''), 1500);
    } catch {
      setExportMsg('复制失败');
    }
  }

  function downloadChapter() {
    if (!chapter) return;
    const text = `# ${chapter.title}\n\n${chapter.outline ? `> ${chapter.outline}\n\n` : ''}${chapter.content || ''}`;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chapter.title}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportMsg('已下载');
    setTimeout(() => setExportMsg(''), 1500);
  }

  async function analyzeVolume() {
    if (!chapter) return;
    setEmotionBusy(true);
    setEmotionMsg('');
    try {
      const res = await fetch('/api/ai/emotion-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumeId: chapter.volumeId }),
      });
      if (res.ok) {
        const json = await res.json();
        setEmotionMsg(`已分析 ${json.count} 章`);
        await mutateEmotion();
      }
    } finally {
      setEmotionBusy(false);
    }
  }

  useEffect(() => {
    const handler = () => void mutateRequests();
    window.addEventListener('ai:adopted', handler);
    return () => window.removeEventListener('ai:adopted', handler);
  }, [mutateRequests]);

  const runCheck = useCallback(async (content: string) => {
    if (!chapter) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json().catch(() => ({}));
      const next = (json.issues as ConsistencyIssue[]) ?? [];
      setIssues(next);
      onIssuesChange(next);
      setAiSkipped(json.aiSkipped ?? null);
    } finally {
      setChecking(false);
    }
  }, [chapter, onIssuesChange]);

  async function runPoisonCheck() {
    if (!chapter) return;
    setPoisonChecking(true);
    try {
      const res = await fetch('/api/ai/poison-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      const json = await res.json().catch(() => ({}));
      setPoisonIssues((json.issues as ConsistencyIssue[]) ?? []);
    } finally {
      setPoisonChecking(false);
    }
  }

  useEffect(() => {
    if (autoCheck == null || !autoCheck) return;
    if (saveState !== 'saved' || !chapter) return;
    if (chapter.content === lastCheckedHash.current) return;
    lastCheckedHash.current = chapter.content;
    const timer = setTimeout(() => void runCheck(chapter.content), 3000);
    return () => clearTimeout(timer);
  }, [saveState, chapter, runCheck, autoCheck]);

  async function createSnapshot() {
    if (!chapter) return;
    setBusy(true);
    try {
      await fetch(`/api/chapters/${chapter.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setLabel('');
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: ChapterSnapshot) {
    if (confirmingId !== s.id || confirmingAction !== 'restore') {
      setConfirmingId(s.id);
      setConfirmingAction('restore');
      return;
    }
    setConfirmingId(null);
    setConfirmingAction(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${s.id}/restore`, { method: 'POST' });
      if (res.ok) {
        setDiff(null);
        await mutate();
        onRestored();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ChapterSnapshot) {
    if (confirmingId !== s.id || confirmingAction !== 'delete') {
      setConfirmingId(s.id);
      setConfirmingAction('delete');
      return;
    }
    setConfirmingId(null);
    setConfirmingAction(null);
    await fetch(`/api/snapshots/${s.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <aside className="flex w-72 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-3 text-sm">
      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">本章信息</h3>
        <dl className="mt-2 space-y-1 text-gray-700">
          <div className="flex justify-between"><dt className="text-gray-500">字数</dt><dd>{wordCount}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">保存状态</dt><dd>{saveLabel(saveState)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">快照数</dt><dd>{snapshots.length}</dd></div>
        </dl>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <button onClick={() => void copyChapter()} disabled={!chapter} className="text-blue-600 disabled:text-gray-300">复制全文</button>
          <button onClick={downloadChapter} disabled={!chapter} className="text-blue-600 disabled:text-gray-300">下载 .md</button>
          {exportMsg && <span className="text-emerald-600">{exportMsg}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">版本快照</h3>
          <button onClick={() => setTimeOpen(true)} disabled={!chapter} className="text-xs text-purple-600 disabled:text-gray-300">时光机</button>
        </div>
        <div className="mt-2 flex gap-1">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createSnapshot();
            }}
            placeholder="快照标签（可选）"
            disabled={!chapter || busy}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          />
          <button
            onClick={() => void createSnapshot()}
            disabled={!chapter || busy}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            + 快照
          </button>
        </div>
        {isLoading && <p className="mt-2 text-gray-400">加载中…</p>}
        {!isLoading && snapshots.length === 0 && <p className="mt-2 text-gray-400">暂无快照</p>}
        <ul className="mt-2 space-y-2">
          {snapshots.map((s) => (
            <li key={s.id} className="rounded border border-gray-100 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">v{s.version}</span>
                <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              {s.label && <div className="text-xs text-gray-500">{s.label}</div>}
              <div className="mt-1 flex gap-2 text-xs">
                <button onClick={() => setDiff(s)} className="text-blue-600 hover:underline">对比</button>
                <button
                  onClick={() => void restore(s)}
                  disabled={busy}
                  className={confirmingId === s.id && confirmingAction === 'restore' ? 'text-red-600' : 'text-emerald-600 hover:underline'}
                >
                  {confirmingId === s.id && confirmingAction === 'restore' ? '确认回滚?' : '回滚'}
                </button>
                <button
                  onClick={() => void remove(s)}
                  disabled={busy}
                  className={confirmingId === s.id && confirmingAction === 'delete' ? 'text-red-600' : 'text-red-500 hover:underline'}
                >
                  {confirmingId === s.id && confirmingAction === 'delete' ? '确认删?' : '删除'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">AI 建议历史</h3>
        {(requestsData?.requests ?? []).length === 0 && <p className="mt-1 text-xs text-gray-400">暂无记录</p>}
        <ul className="mt-1 space-y-1">
          {(requestsData?.requests ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs text-gray-600">
              <span>{kindLabel(r.kind)} · {r.model}</span>
              <span className={r.accepted ? 'text-emerald-600' : 'text-gray-400'}>{r.accepted ? '已采纳' : '未采纳'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">情绪脉冲</h3>
          <span className="flex gap-1">
            <button onClick={() => void analyzeChapter()} disabled={!chapter || emotionBusy} className="text-xs text-blue-600 disabled:text-gray-300">分析本章</button>
            <button onClick={() => void analyzeVolume()} disabled={!chapter || emotionBusy} className="text-xs text-blue-600 disabled:text-gray-300">批量整卷</button>
          </span>
        </div>
        {emotionMsg && <p className="mt-1 text-xs text-emerald-600">{emotionMsg}</p>}
        {emotionBusy && <p className="mt-1 text-xs text-amber-500">分析中…</p>}
        {chapter && <LiveEmotionPulse text={liveText} chapterId={chapter.id} />}
        {currentAnalysis ? (
          <div className="mt-2 rounded border border-blue-100 bg-blue-50/50 p-2">
            <p className="text-[10px] font-medium text-blue-600">AI 深度分析</p>
            <div className="mt-1.5 space-y-1 text-xs">
              {[
                ['压抑', currentAnalysis.buildUp, '#64748b'],
                ['期待', currentAnalysis.anticipation, '#d97706'],
                ['释放', currentAnalysis.release, '#e11d48'],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex items-center gap-1">
                  <span className="w-6 text-gray-500">{label}</span>
                  <div className="h-2 min-w-0 flex-1 rounded bg-gray-100">
                    <div className="h-2 rounded" style={{ width: `${(value as number) * 10}%`, backgroundColor: color as string }} />
                  </div>
                  <span className="w-6 text-right text-gray-500">{value as number}</span>
                </div>
              ))}
              {currentAnalysis.driver && <p className="pt-1 text-gray-500">驱动：{currentAnalysis.driver}</p>}
            </div>
          </div>
        ) : null}
        {emotionRows.length >= 2 && <EmotionChart rows={emotionRows} />}
        <ul className="mt-1 space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{w}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">一致性警报</h3>
          <button onClick={() => chapter && void runCheck(chapter.content)} disabled={!chapter || checking} className="text-xs text-blue-600 disabled:text-gray-300">
            {checking ? '检查中…' : '重新检查'}
          </button>
        </div>
        {checking && <p className="mt-1 text-xs text-gray-400">正在检查…</p>}
        {!checking && issues.length === 0 && <p className="mt-1 text-xs text-gray-400">{aiSkipped ? `已通过规则检查；${aiSkipped}` : '未发现冲突'}</p>}
        <ul className="mt-1 space-y-2">
          {issues.map((issue, i) => (
            <li key={i} className="rounded border border-red-100 bg-red-50 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-700">{issue.type}</span>
                <span className="flex items-center gap-2">
                  <button onClick={() => locateIssue(i)} className="text-blue-600 hover:underline" title="在正文中标出并选中该冲突位置">正文定位</button>
                  <span className="text-gray-400">{issue.source === 'rule' ? '规则' : 'AI'}</span>
                </span>
              </div>
              {issue.text && <p className="mt-0.5 text-red-600">{issue.text}</p>}
              {issue.reason && <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>}
              {issue.suggestion && <p className="mt-0.5 text-gray-600">建议：{issue.suggestion}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">毒点警报</h3>
          <button onClick={() => void runPoisonCheck()} disabled={!chapter || poisonChecking} className="text-xs text-purple-600 disabled:text-gray-300">
            {poisonChecking ? '审查中…' : '毒点审查'}
          </button>
        </div>
        {!poisonChecking && poisonIssues.length === 0 && <p className="mt-1 text-xs text-gray-400">未发现毒点（手动审查）</p>}
        <ul className="mt-1 space-y-2">
          {poisonIssues.map((issue, i) => (
            <li key={i} className="rounded border border-purple-100 bg-purple-50 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-purple-700">{issue.type}</span>
                <span className="text-gray-400">毒点</span>
              </div>
              {issue.text && <p className="mt-0.5 text-purple-800">{issue.text}</p>}
              {issue.reason && <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>}
              {issue.suggestion && <p className="mt-0.5 text-gray-600">建议：{issue.suggestion}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">角色状态 · 信息差</h3>
          <button onClick={() => setSecretsOpen(true)} disabled={!chapter} className="text-xs text-purple-600 disabled:text-gray-300">秘密矩阵</button>
        </div>
        {(statusData?.status ?? []).length === 0 && <p className="mt-1 text-xs text-gray-400">暂无实体状态</p>}
        <ul className="mt-1 space-y-1">
          {(statusData?.status ?? []).map((s) => (
            <li key={s.id} className="text-xs text-gray-600">
              <span className="font-medium">{s.name}</span>
              <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-400">{typeLabel(s.type)}</span>
              <StatusRows latest={s.latest} type={s.type} />
            </li>
          ))}
        </ul>
      </section>

      {diff && chapter && (
        <SnapshotDiff current={chapter.content} snapshot={diff} onClose={() => setDiff(null)} />
      )}
      {timeOpen && chapter && (
        <TimeMachineModal
          chapterId={chapter.id}
          currentContent={chapter.content}
          onClose={() => setTimeOpen(false)}
          onForked={(id) => {
            setTimeOpen(false);
            onForked(id);
          }}
        />
      )}
      {secretsOpen && chapter && (
        <SecretsModal
          projectId={chapter.projectId}
          onClose={() => setSecretsOpen(false)}
        />
      )}
    </aside>
  );
}

function typeLabel(type: string): string {
  if (type === 'character') return '人物';
  if (type === 'faction') return '阵营';
  if (type === 'location') return '地点';
  if (type === 'system') return '体系';
  if (type === 'artifact') return '道具';
  return type;
}

function StatusRows({ latest, type }: { latest: Record<string, unknown>; type: string }) {
  const rows = Object.entries(latest)
    .map(([key, value]) => ({ key, label: keyLabel(key), value: String(value) }))
    .filter((r) => r.value.trim());
  if (rows.length === 0) return <span className="text-gray-400"> · 无状态</span>;
  const belongings = latest.belongings ? String(latest.belongings).split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [];
  return (
    <div className="mt-0.5 space-y-0.5 text-gray-500">
      {belongings.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-gray-400">随身道具：</span>
          {belongings.map((item, i) => (
            <span key={i} className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">{item}</span>
          ))}
        </div>
      )}
      {rows
        .filter((r) => !(type === 'character' && r.key === 'belongings'))
        .map((r) => (
          <div key={r.key} className="truncate" title={r.value}>
            <span className="text-gray-400">{r.label}：</span>
            {r.value}
          </div>
        ))}
    </div>
  );
}

function keyLabel(key: string): string {
  const labels: Record<string, string> = {
    want: '欲望',
    need: '需求/恐惧',
    flaw: '缺陷',
    moralBoundary: '道德底线',
    belongings: '随身道具',
    speechTic: '口癖',
    speechStyle: '用词风格',
    speechPace: '语速节奏',
    speechRestraint: '隐忍度',
  };
  return labels[key] ?? key;
}

function locateIssue(issueIndex: number) {
  window.dispatchEvent(new CustomEvent('consistency:locate', { detail: { issueIndex } }));
}

function saveLabel(state: string): string {
  switch (state) {
    case 'pending':
      return '待保存';
    case 'saving':
      return '保存中…';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    default:
      return '就绪';
  }
}

function kindLabel(kind: string): string {
  if (kind === 'ghostwrite') return '伴写';
  if (kind === 'rewrite') return '润色';
  if (kind === 'style') return '文风迁移';
  if (kind === 'poison') return '毒点审查';
  if (kind === 'emotion') return '情绪分析';
  if (kind === 'outline') return '大纲骨架';
  if (kind === 'outline-check') return '大纲预演';
  if (kind === 'mc') return '分支推演';
  if (kind === 'blockbreaker') return '破局';
  return kind;
}
