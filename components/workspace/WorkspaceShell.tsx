'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Sidebar from './Sidebar';
import ChapterEditor from './ChapterEditor';
import InspectorPanel from './InspectorPanel';
import SettingsModal from './SettingsModal';
import { useAutosave } from '@/lib/useAutosave';
import { countWords } from '@/lib/wordCount';
import type { ChapterWithVolume, Project, Volume } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WorkspaceShell({ projectId }: { projectId: string }) {
  const { data: projectData } = useSWR<{ project: Project }>(`/api/projects/${projectId}`, fetcher);
  const { data: volumesData, mutate: mutateVolumes } = useSWR<{ volumes: Volume[] }>(`/api/projects/${projectId}/volumes`, fetcher);
  const { data: chaptersData, mutate: mutateChapters } = useSWR<{ chapters: ChapterWithVolume[] }>(`/api/projects/${projectId}/chapters`, fetcher);

  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef('');

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
      await mutateChapters();
    },
    [currentChapterId, mutateChapters],
  );

  const autosave = useAutosave(save);

  const handleContentChange = useCallback(
    (content: string) => {
      contentRef.current = content;
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
      contentRef.current = next?.content ?? '';
      setWordCount(countWords(next?.content ?? ''));
    },
    [autosave, chaptersData],
  );

  // 初始选中第一章；当前章被删除时回退到第一章
  useEffect(() => {
    if (chapters.length === 0) {
      setCurrentChapterId(null);
      contentRef.current = '';
      setWordCount(0);
      return;
    }
    if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId)) {
      const first = chapters[0];
      setCurrentChapterId(first.id);
      contentRef.current = first.content;
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
    setWordCount(countWords(restored?.content ?? ''));
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold">{projectData?.project?.title ?? '加载中…'}</h1>
          <span className="text-xs text-gray-500">墨影 AI</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <SaveBadge state={autosave.state} onRetry={autosave.retry} />
          <span>{wordCount} 字</span>
          <button onClick={() => setShowSettings(true)} className="text-gray-500 hover:text-blue-600">设置</button>
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
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <p className="p-6 text-gray-500">加载中…</p>
          ) : current ? (
            <ChapterEditor
              key={`${current.id}-${refreshToken}`}
              chapterId={current.id}
              title={current.title}
              initialContent={current.content}
              onChange={handleContentChange}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              尚无章节，请在左侧创建第一卷并添加章节。
            </div>
          )}
        </main>
        <InspectorPanel
          chapter={current}
          saveState={autosave.state}
          wordCount={wordCount}
          onRestored={() => void handleRestored()}
        />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function SaveBadge({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === 'pending' || state === 'saving') return <span className="text-amber-600">保存中…</span>;
  if (state === 'error') return <button onClick={onRetry} className="text-red-600 underline">保存失败，点此重试</button>;
  if (state === 'saved') return <span className="text-emerald-600">已保存</span>;
  return <span>就绪</span>;
}
