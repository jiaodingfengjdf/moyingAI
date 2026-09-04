export type EntityType = 'character' | 'faction' | 'location' | 'system' | 'artifact';
export type ChapterStatus = 'draft' | 'final';
export type ForeshadowingStatus = 'planting' | 'simmering' | 'payoff';

export interface Project {
  id: string;
  title: string;
  penName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithCounts extends Project {
  volumeCount: number;
  chapterCount: number;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookArc {
  id: string;
  title: string;
  goal: string;
  summary: string;
}

export interface ProjectOutline {
  projectId: string;
  synopsis: string;
  theme: string;
  arcs: BookArc[];
  updatedAt: string;
}

export interface Secret {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  knownEntityIds: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  content: string;
  outline: string;
  status: ChapterStatus;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterWithVolume extends Chapter {
  projectId: string;
  volumeTitle: string;
}

export interface ChapterSnapshot {
  id: string;
  chapterId: string;
  version: number;
  content: string;
  label: string | null;
  branchId: string | null;
  createdAt: string;
}

export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  fields: Record<string, unknown>;
  description: string;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityTimelineEntry {
  id: string;
  entityId: string;
  chapterId: string | null;
  change: Record<string, unknown>;
  note: string;
  createdAt: string;
}

export interface AISettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
}

export interface AIRequest {
  id: string;
  projectId: string;
  chapterId: string | null;
  kind: string;
  model: string;
  accepted: boolean;
  createdAt: string;
}

export interface Relationship {
  id: string;
  projectId: string;
  fromEntityId: string;
  toEntityId: string;
  fromName: string;
  toName: string;
  type: string;
  strength: number;
  chapterAnchorId: string | null;
  chapterAnchorTitle: string | null;
  note: string;
}

export interface Foreshadowing {
  id: string;
  projectId: string;
  title: string;
  status: ForeshadowingStatus;
  plantChapterId: string | null;
  simmerRangeStart: number | null;
  simmerRangeEnd: number | null;
  payoffChapterId: string | null;
  relatedEntityIds: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
  plantChapterTitle: string | null;
  payoffChapterTitle: string | null;
  overdue: boolean;
}

export interface ConsistencyIssue {
  type: string;
  text: string;
  reason: string;
  suggestion: string;
  source: 'rule' | 'llm';
}

export type SceneStatus = 'draft' | 'done';

export interface Scene {
  id: string;
  chapterId: string;
  title: string;
  goal: string;
  points: string;
  status: SceneStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}
