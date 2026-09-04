'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { estimateLiveEmotion, type LiveEmotion } from '@/lib/emotion/live';

const MAX_POINTS = 64;
type EmotionAxis = 'buildUp' | 'anticipation' | 'release';
const COLORS: Record<EmotionAxis, string> = {
  buildUp: '#64748b',
  anticipation: '#d97706',
  release: '#e11d48',
};
const KEYS: EmotionAxis[] = ['buildUp', 'anticipation', 'release'];
const LABELS: Record<EmotionAxis, string> = {
  buildUp: '抑',
  anticipation: '期',
  release: '释',
};

export default function LiveEmotionPulse({ text, chapterId }: { text: string; chapterId: string }) {
  const current = useMemo(() => estimateLiveEmotion(text), [text]);
  const [history, setHistory] = useState<LiveEmotion[]>([]);
  const lastSampleAt = useRef(0);
  const lastLen = useRef(0);
  const hasText = text.trim().length > 0;

  useEffect(() => {
    setHistory([]);
    lastSampleAt.current = 0;
    lastLen.current = 0;
  }, [chapterId]);

  useEffect(() => {
    if (!hasText) {
      setHistory([]);
      lastSampleAt.current = 0;
      lastLen.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastSampleAt.current < 260 && Math.abs(text.length - lastLen.current) < 140) return;
    lastSampleAt.current = now;
    lastLen.current = text.length;
    setHistory((prev) => [...prev, estimateLiveEmotion(text)].slice(-MAX_POINTS));
  }, [text, hasText]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-emerald-700">实时情绪</span>
        <span className="text-[10px] text-gray-400">{hasText ? '随输入估算' : '等待正文…'}</span>
      </div>
      {hasText ? (
        <>
          <div className="mt-1.5 space-y-1 text-xs">
            {KEYS.map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className="w-4 text-gray-500">{LABELS[k]}</span>
                <div className="h-1.5 min-w-0 flex-1 rounded bg-gray-100">
                  <div className="h-1.5 rounded" style={{ width: `${current[k] * 10}%`, backgroundColor: COLORS[k] }} />
                </div>
                <span className="w-5 text-right text-gray-500">{current[k]}</span>
              </div>
            ))}
            <p className="pt-0.5 text-gray-500">驱动：{current.driver}</p>
          </div>
          {history.length >= 2 && <TrendSpark history={history} />}
        </>
      ) : (
        <p className="mt-1 text-xs text-gray-400">输入正文后此处将实时滚动情绪曲线</p>
      )}
    </div>
  );
}

function TrendSpark({ history }: { history: LiveEmotion[] }) {
  const width = 260;
  const height = 64;
  const pad = 4;
  const n = history.length;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (n - 1);
  const y = (v: number) => height - pad - (v / 10) * (height - pad * 2);
  const path = (key: (typeof KEYS)[number]) =>
    history.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(h[key]).toFixed(1)}`).join(' ');
  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {KEYS.map((k) => (
          <path key={k} d={path(k)} fill="none" stroke={COLORS[k]} strokeWidth="1.3" />
        ))}
      </svg>
      <div className="flex justify-end gap-2 text-[10px] text-gray-400">
        {KEYS.map((k) => (
          <span key={k} className="flex items-center gap-0.5">
            <i className="inline-block h-1 w-2 rounded" style={{ backgroundColor: COLORS[k] }} />
            {LABELS[k]}
          </span>
        ))}
        <span className="text-gray-300">·</span>
        <span>输入滚动采样 {history.length}</span>
      </div>
    </div>
  );
}
