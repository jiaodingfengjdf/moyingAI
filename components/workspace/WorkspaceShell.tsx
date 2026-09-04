'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import ChapterEditor from './ChapterEditor';
import ChapterOutlineView from './ChapterOutlineView';
import MarkdownSourceView from './MarkdownSourceView';
import InspectorPanel from './InspectorPanel';
import SettingsModal from './SettingsModal';
import ComplianceModal from './ComplianceModal';
import ShortcutsModal from './ShortcutsModal';
import type { OutlineBridge } from './ChapterOutlineView';
import { useAutosave } from '@/lib/useAutosave';
import { countWords } from '@/lib/wordCount';
import type { ChapterWithVolume, Project, Volume } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WorkspaceShell({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: projectData } = useSWR<{ project: Project }>(`/api/projects/${projectId}`, fetcher);
  const { data: volumesData, mutate: mutateVolumes } = useSWR<{ volumes: Volume[] }>(`/api/projects/${projectId}/volumes`, fetcher);
  const { data: chaptersData, mutate: mutateChapters } = useSWR<{ chapters: ChapterWithVolume[] }>(`/api/projects/${projectId}/chapters`, fetcher);

  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showExit, setShowExit] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [view, setView] = useState<'write' | 'outline'>('write');
  const [editorMode, setEditorMode] = useState<'visual' | 'source'>('visual');
  const [mdText, setMdText] = useState('');
  const contentRef = useRef('');
  const lastSavedRef = useRef('');
  const chapterIdRef = useRef<string | null>(null);
  const outlineBridgeRef = useRef<OutlineBridge | null>(null);
  chapterIdRef.current = currentChapterId;

  const volumes = useMemo(() => volumesData?.volumes ?? [], [volumesData]);
  const chapters = useMemo(() => chaptersData?.chapters ?? [], [chaptersData]);
  const current = chapters.find((c) => c.id === currentChapterId) ?? null;
  const loading = !volumesData || !chaptersData;

  const save = useCallback(
    async (content: string) => {
      if (!currentChapterId) return;
      const res = await fetch(`/api/chapters/${currentChapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('保存失败');
      lastSavedRef.current = content;
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      await mutateChapters();
    },
    [currentChapterId, mutateChapters],
  );

  const autosave = useAutosave(save);

  const outlineBridge = outlineBridgeRef.current;
  const baseContentRef = useRef('');
  const dirty = contentRef.current !== lastSavedRef.current
    || autosave.state === 'pending'
    || autosave.state === 'saving'
    || autosave.state === 'error'
    || Boolean(outlineBridge && (outlineBridge.state === 'pending' || outlineBridge.state === 'saving' || outlineBridge.state === 'error'));

  async function exitAndSave() {
    setExiting(true);
    await autosave.flush();
    await outlineBridgeRef.current?.flush();
    router.push('/');
  }

  function exitDiscard() {
    const id = chapterIdRef.current;
    const currentContent = contentRef.current;
    const baseContent = baseContentRef.current;
    const bridge = outlineBridgeRef.current;
    autosave.discard();
    bridge?.discard();
    if (id && currentContent !== baseContent) {
      void fetch(`/api/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: baseContent }),
      }).catch(() => {});
    }
    if (id && bridge && bridge.text !== bridge.base) {
      void fetch(`/api/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: bridge.base }),
      }).catch(() => {});
    }
    router.push('/');
  }

  const handleContentChange = useCallback(
    (content: string) => {
      contentRef.current = content;
      setMdText(content);
      setWordCount(countWords(content));
      autosave.schedule(content);
    },
    [autosave],
  );

  const switchChapter = useCallback(
    async (id: string) => {
      await autosave.flush();
      setCurrentChapterId(id);
      const next = (chaptersData?.chapters ?? []).find((c) => c.id === id);
      if (next) {
        lastSavedRef.current = next.content;
        baseContentRef.current = next.content;
      }
      contentRef.current = next?.content ?? '';
      setMdText(next?.content ?? '');
      setWordCount(countWords(next?.content ?? ''));
    },
    [autosave, chaptersData],
  );

  // 关闭/隐藏/离开页面时用 keepalive 兜底保存防抖窗口内的内容
  useEffect(() => {
    const persist = () => {
      const id = chapterIdRef.current;
      const content = contentRef.current;
      if (!id || !content || content === lastSavedRef.current) return;
      void fetch(`/api/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        keepalive: true,
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', persist);
      window.removeEventListener('beforeunload', persist);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Ctrl/Cmd + S：立即保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void autosave.flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autosave]);

  // 初始选中第一章；当前章被删除时回退到第一章
  useEffect(() => {
    if (chapters.length === 0) {
      setCurrentChapterId(null);
      contentRef.current = '';
      baseContentRef.current = '';
      setMdText('');
      setWordCount(0);
      return;
    }
    if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId)) {
      const first = chapters[0];
      setCurrentChapterId(first.id);
      contentRef.current = first.content;
      baseContentRef.current = first.content;
      setMdText(first.content);
      setWordCount(countWords(first.content));
    }
  }, [chapters, currentChapterId]);

  async function handleChanged() {
    await mutateVolumes();
    await mutateChapters();
  }

  async function handleRestored() {
    const updated = await mutateChapters();
    const restored = (updated?.chapters ?? []).find((c) => c.id === currentChapterId);
    contentRef.current = restored?.content ?? '';
    baseContentRef.current = restored?.content ?? '';
    setMdText(restored?.content ?? '');
    setWordCount(countWords(restored?.content ?? ''));
    setRefreshToken((t) => t + 1);
  }

  async function handleForked(id: string) {
    await autosave.flush();
    await mutateChapters();
    await switchChapter(id);
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold">{projectData?.project?.title ?? '加载中…'}</h1>
          <span className="text-xs text-gray-500">墨影 AI</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <SaveBadge state={autosave.state} onRetry={autosave.retry} lastSavedAt={lastSavedAt} />
          <span>{wordCount} 字</span>
          <button onClick={() => setShowCompliance(true)} className="text-gray-500 hover:text-blue-600">合规</button>
          <button onClick={() => setShowShortcuts(true)} className="text-gray-500 hover:text-blue-600">快捷键</button>
          <button onClick={() => setShowSettings(true)} className="text-gray-500 hover:text-blue-600">设置</button>
          <button onClick={() => setShowExit(true)} className="text-gray-500 hover:text-red-600">退出</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projectId={projectId}
          volumes={volumes}
          chapters={chapters}
          currentChapterId={currentChapterId}
          onSelect={(id) => void switchChapter(id)}
          onChanged={() => void handleChanged()}
          flushPending={() => autosave.flush()}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <p className="p-6 text-gray-500">加载中…</p>
          ) : current ? (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-1">
                <div className="flex gap-1">
                  {(['write', 'outline'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`rounded px-3 py-0.5 text-xs ${view === v ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                      {v === 'write' ? '正文' : '大纲'}
                    </button>
                  ))}
                </div>
                {view === 'write' && (
                  <div className="flex gap-1">
                    {(['visual', 'source'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setEditorMode(m)}
                        className={`rounded px-2 py-0.5 text-xs ${editorMode === m ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                      >
                        {m === 'visual' ? '可视化' : '源码'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div
                className={view === 'write' && editorMode === 'visual' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
                style={view !== 'write' || editorMode !== 'visual' ? { display: 'none' } : undefined}
              >
                <ChapterEditor
                  key={`${current.id}-${refreshToken}-${editorMode}`}
                  chapterId={current.id}
                  title={current.title}
                  initialContent={editorMode === 'visual' ? mdText : current.content}
                  onChange={handleContentChange}
                />
              </div>
              {view === 'write' && editorMode === 'source' && (
                <MarkdownSourceView value={mdText} onChange={handleContentChange} />
              )}
              {view === 'outline' && (
                <ChapterOutlineView
                  key={`${current.id}-${refreshToken}`}
                  chapter={current}
                  onOutlineSaved={() => void mutateChapters()}
                  bridge={outlineBridgeRef}
                />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              尚无章节，请在左侧创建第一卷并添加章节。
            </div>
          )}
        </main>
        <InspectorPanel
          chapter={current}
          liveText={mdText}
          saveState={autosave.state}
          wordCount={wordCount}
          onRestored={() => void handleRestored()}
          onForked={(id) => void handleForked(id)}
        />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCompliance && <ComplianceModal projectId={projectId} onClose={() => setShowCompliance(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h3 className="font-medium">退出到主页</h3>
            <p className="mt-2 text-sm text-gray-600">
              {dirty ? '当前有尚未保存的内容，请选择处理方式。' : '当前没有未保存内容。'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowExit(false)} disabled={exiting} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
              <button onClick={exitDiscard} disabled={exiting} className="rounded border border-gray-300 px-3 py-1.5 text-gray-600">不保存退出</button>
              <button onClick={() => void exitAndSave()} disabled={exiting} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
                {exiting ? '保存中…' : '保存并退出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state, onRetry, lastSavedAt }: { state: string; onRetry: () => void; lastSavedAt: string | null }) {
  if (state === 'pending' || state === 'saving') return <span className="text-amber-600">保存中…</span>;
  if (state === 'error') return <button onClick={onRetry} className="text-red-600 underline">保存失败，点此重试</button>;
  if (state === 'saved') return <span className="text-emerald-600">已保存 {lastSavedAt ?? ''}</span>;
  return <span>就绪</span>;
}
