'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Entity, Relationship } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function RelationGraphModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: entitiesData } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const { data: relationData } = useSWR<{ relationships: Relationship[] }>(`/api/projects/${projectId}/relationships`, fetcher);
  const [selected, setSelected] = useState<string | null>(null);
  const entities = entitiesData?.entities ?? [];
  const relationships = relationData?.relationships ?? [];
  const width = 520;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(180, (entities.length > 1 ? Math.min(width, height) : 200) / 2 - 46);
  const pos = new Map<string, { x: number; y: number }>();
  entities.forEach((e, i) => {
    const angle = (i / Math.max(1, entities.length)) * Math.PI * 2 - Math.PI / 2;
    pos.set(e.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">关系图谱（{entities.length} 节点 / {relationships.length} 边）</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        {entities.length === 0 ? (
          <p className="py-12 text-sm text-gray-400">暂无实体，先创建实体并建立关系。</p>
        ) : (
          <svg width={width} height={height} className="mt-2">
            {relationships.map((r) => {
              const a = pos.get(r.fromEntityId);
              const b = pos.get(r.toEntityId);
              if (!a || !b) return null;
              const active = selected === r.fromEntityId || selected === r.toEntityId;
              return (
                <line
                  key={r.id}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={r.strength >= 0 ? '#10b981' : '#f43f5e'}
                  strokeOpacity={active || !selected ? 0.8 : 0.15}
                  strokeWidth={active ? 2 : 1}
                >
                  <title>{`${r.fromName} → ${r.toName} · ${r.type} · ${r.strength}${r.note ? `（${r.note}）` : ''}`}</title>
                </line>
              );
            })}
            {entities.map((e) => {
              const p = pos.get(e.id)!;
              const active = selected === e.id;
              return (
                <g key={e.id} transform={`translate(${p.x},${p.y})`} onClick={() => setSelected(active ? null : e.id)} className="cursor-pointer">
                  <circle r={active ? 14 : 11} fill={active ? '#2563eb' : '#64748b'} />
                  <text y={26} textAnchor="middle" fontSize="11" fill="#334155">{e.name}</text>
                </g>
              );
            })}
          </svg>
        )}
        {selected && <p className="mt-1 text-xs text-gray-400">已高亮 {selected === null ? '' : entities.find((e) => e.id === selected)?.name} 的关系，点击节点取消。</p>}
      </div>
    </div>
  );
}
