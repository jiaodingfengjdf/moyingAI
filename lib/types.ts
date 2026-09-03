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
