'use client';

import { useState } from 'react';
import useSWR from 'swr';
import EntityForm from './EntityForm';
import type { Entity, EntityType } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const TYPE_LABELS: Record<EntityType, string> = {
  character: '人物',
  faction: '阵营势力',
  location: '地点',
  system: '功法/体系',
  artifact: '道具/宝物',
};

export default function EntityPanel({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const entities = data?.entities ?? [];
  const groups = Object.keys(TYPE_LABELS) as EntityType[];

  return (
    <div className="mt-6 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-500">实体档案馆</h3>
        <button onClick={() => setEditing('new')} className="text-blue-600">+ 实体</button>
      </div>
      {groups.map((type) => {
        const list = entities.filter((e) => e.type === type);
        if (list.length === 0) return null;
        return (
          <div key={type} className="mt-2">
            <div className="text-xs text-gray-400">{TYPE_LABELS[type]}（{list.length}）</div>
            {list.map((e) => (
              <button key={e.id} onClick={() => setEditing(e)} className="block w-full truncate py-0.5 pl-3 text-left text-gray-700 hover:bg-gray-100">
                {e.name}
              </button>
            ))}
          </div>
        );
      })}
      {entities.length === 0 && <p className="mt-1 text-xs text-gray-300">暂无实体，点「+ 实体」创建（AI 上下文 L3 层依赖实体卡）。</p>}
      {editing && (
        <EntityForm
          projectId={projectId}
          entity={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
