'use client';

interface Row {
  chapterId: string;
  title: string;
  buildUp: number;
  anticipation: number;
  release: number;
}

export default function EmotionChart({ rows }: { rows: Row[] }) {
  const width = 360;
  const height = 120;
  const pad = 4;
  const n = Math.max(2, rows.length);
  const x = (i: number) => pad + (i * (width - pad * 2)) / (n - 1);
  const y = (v: number) => height - pad - (v / 10) * (height - pad * 2);
  const path = (key: 'buildUp' | 'anticipation' | 'release') =>
    rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
  const COLORS = { buildUp: '#64748b', anticipation: '#d97706', release: '#e11d48' };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 w-full">
      {(['buildUp', 'anticipation', 'release'] as const).map((k) => (
        <path key={k} d={path(k)} fill="none" stroke={COLORS[k]} strokeWidth="1.5" />
      ))}
      <g className="text-[9px]" fill="#6b7280">
        {rows.map((r, i) => (i % Math.max(1, Math.floor(n / 6)) === 0 || i === n - 1 ? <text key={r.chapterId} x={x(i)} y={height - 1} textAnchor="middle">{r.title.slice(0, 4)}</text> : null))}
      </g>
    </svg>
  );
}
