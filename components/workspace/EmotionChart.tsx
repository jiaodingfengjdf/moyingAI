'use client';

import { emotionPhase, hormoneIndex, type EmotionPhase } from '@/lib/ai/emotion';

interface Row {
  chapterId: string;
  title: string;
  buildUp: number;
  anticipation: number;
  release: number;
}

const PHASE_COLORS: Record<EmotionPhase, string> = {
  压抑蓄力: '#64748b',
  期待推高: '#d97706',
  释放高潮: '#e11d48',
  过渡: '#9ca3af',
};

interface Point {
  x: number;
  y: number;
}

export default function EmotionChart({ rows }: { rows: Row[] }) {
  const width = 360;
  const height = 150;
  const padX = 6;
  const padTop = 10;
  const padBottom = 18;
  const n = Math.max(2, rows.length);
  const x = (i: number) => padX + (i * (width - padX * 2)) / (n - 1);
  const y = (v: number) => padTop + (1 - v / 10) * (height - padTop - padBottom);
  const points: Point[] = rows.map((r, i) => ({ x: x(i), y: y(hormoneIndex(r)) }));
  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)},${(height - padBottom).toFixed(1)} L ${points[0].x.toFixed(1)},${(height - padBottom).toFixed(1)} Z`;

  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <defs>
          <linearGradient id="hormoneArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={padX} x2={width - padX} y1={y(7)} y2={y(7)} stroke="#fca5a5" strokeDasharray="4 4" strokeWidth="0.8" />
        <text x={width - padX} y={y(7) - 3} textAnchor="end" className="text-[8px]" fill="#f87171">
          高能线 7
        </text>
        <path d={area} fill="url(#hormoneArea)" />
        <path d={line} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
        {rows.map((r, i) => {
          const phase = emotionPhase(r);
          return (
            <g key={r.chapterId}>
              <circle cx={x(i)} cy={y(hormoneIndex(r))} r={i === rows.length - 1 ? 3.6 : 2.8} fill={PHASE_COLORS[phase]} stroke="#fff" strokeWidth="1" />
              {i === rows.length - 1 && (
                <text x={x(i)} y={y(hormoneIndex(r)) - 5} textAnchor="middle" className="text-[9px]" fill="#b91c1c" fontWeight="700">
                  {hormoneIndex(r)}
                </text>
              )}
            </g>
          );
        })}
        <g className="text-[9px]" fill="#6b7280">
          {rows.map((r, i) =>
            i % Math.max(1, Math.floor(n / 6)) === 0 || i === n - 1
              ? <text key={r.chapterId} x={x(i)} y={height - 4} textAnchor="middle">{r.title.slice(0, 4)}</text>
              : null,
          )}
        </g>
      </svg>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
        <span>荷尔蒙 = 压抑×0.3 + 期待×0.35 + 释放×0.35</span>
        {(Object.keys(PHASE_COLORS) as EmotionPhase[]).map((p) => (
          <span key={p} className="flex items-center gap-0.5">
            <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PHASE_COLORS[p] }} />
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function smoothPath(points: Point[]): string {
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    d += ` C ${midX.toFixed(1)},${prev.y.toFixed(1)} ${midX.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}
