'use client';

import { useState } from 'react';
import useSWR from 'swr';
import EntityForm from './EntityForm';
import RelationshipForm from './RelationshipForm';
import type { Entity, EntityType, Relationship } from '@/lib/types';

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
  const { data: relationData, mutate: mutateRelations } = useSWR<{ relationships: Relationship[] }>(`/api/projects/${projectId}/relationships`, fetcher);
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [relationForm, setRelationForm] = useState<Relationship | 'new' | null>(null);
  const [confirmingRelation, setConfirmingRelation] = useState<string | null>(null);
  const entities = data?.entities ?? [];
  const relationships = relationData?.relationships ?? [];
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
      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">实体关系（{relationships.length}）</span>
          <button onClick={() => setRelationForm('new')} className="text-blue-600">+ 关系</button>
        </div>
        {relationships.map((r) => (
          <div key={r.id} className="group flex items-center justify-between gap-1 py-0.5 pl-3 text-gray-600">
            <button onClick={() => setRelationForm(r)} className="min-w-0 flex-1 truncate text-left" title={r.note}>
              {r.fromName} → {r.toName} · {r.type} · {r.strength}
            </button>
            <button
              onClick={async () => {
                if (confirmingRelation !== r.id) {
                  setConfirmingRelation(r.id);
                  return;
                }
                setConfirmingRelation(null);
                await fetch(`/api/relationships/${r.id}`, { method: 'DELETE' });
                await mutateRelations();
              }}
              className={confirmingRelation === r.id ? 'shrink-0 text-red-600' : 'shrink-0 text-gray-400 hover:text-red-600'}
            >
              {confirmingRelation === r.id ? '确认删?' : '删'}
            </button>
          </div>
        ))}
        {relationships.length === 0 && <p className="mt-1 pl-3 text-xs text-gray-300">暂无关系</p>}
      </div>
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
      {relationForm && (
        <RelationshipForm
          projectId={projectId}
          relationship={relationForm === 'new' ? null : relationForm}
          onClose={() => setRelationForm(null)}
          onSaved={() => {
            setRelationForm(null);
            void mutateRelations();
          }}
        />
      )}
    </div>
  );
}
