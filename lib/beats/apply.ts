import { getDb, type DB } from '../db/client';
import { getVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { createScene } from '../db/scenes';
import type { Beat, SkeletonPayload } from './templates';

export function insertSkeleton(projectId: string, volumeId: string, payload: SkeletonPayload, db: DB = getDb()): { chapterCount: number; sceneCount: number } {
  const volume = getVolume(volumeId, db);
  if (!volume || volume.projectId !== projectId) throw new Error('卷不存在或不属于该项目');
  let chapterCount = 0;
  let sceneCount = 0;
  for (const ch of payload.chapters) {
    const chapter = createChapter(volumeId, { title: ch.title, outline: ch.outline }, db);
    chapterCount += 1;
    for (const beat of ch.beats ?? []) {
      createScene(chapter.id, { title: beat.title, goal: beat.goal, points: beat.points ?? '' }, db);
      sceneCount += 1;
    }
  }
  if (payload.volumeOutline) {
    db.prepare('UPDATE volume SET summary = ?, updatedAt = ? WHERE id = ?')
      .run(payload.volumeOutline, new Date().toISOString(), volumeId);
  }
  return { chapterCount, sceneCount };
}

export function insertBeats(chapterId: string, beats: Beat[], db: DB = getDb()): number {
  let count = 0;
  for (const beat of beats) {
    createScene(chapterId, { title: beat.title, goal: beat.goal, points: beat.points ?? '' }, db);
    count += 1;
  }
  return count;
}
