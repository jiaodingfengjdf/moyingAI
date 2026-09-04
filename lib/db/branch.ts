import { getDb, type DB } from './client';
import { createChapter, getChapter } from './chapters';
import { getSnapshot } from './snapshots';

export function forkSnapshotToChapter(snapshotId: string, db: DB = getDb()) {
  const snap = getSnapshot(snapshotId, db);
  if (!snap) throw new Error('快照不存在');
  const source = getChapter(snap.chapterId, db);
  if (!source) throw new Error('章节不存在');
  const tag = snap.branchId ?? snap.label ?? `v${snap.version}`;
  const chapter = createChapter(source.volumeId, {
    title: `${source.title}·分支${tag}`,
    content: snap.content,
    outline: source.outline,
  }, db);
  return { chapter };
}
