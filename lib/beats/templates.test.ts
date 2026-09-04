import { describe, it, expect } from 'vitest';
import { BEAT_TEMPLATES, templateFirstChapterBeats, templateToVolumeSkeleton } from './templates';

describe('beat templates', () => {
  it('内置四套模板且结构完整', () => {
    expect(BEAT_TEMPLATES.map((t) => t.id)).toEqual(['golden-three', 'face-slap', 'dungeon', 'ensemble']);
    for (const t of BEAT_TEMPLATES) {
      expect(t.chapters.length).toBeGreaterThanOrEqual(3);
      for (const c of t.chapters) {
        expect(c.title).toBeTruthy();
        expect(c.outline).toBeTruthy();
        expect(c.beats.length).toBeGreaterThanOrEqual(2);
        for (const b of c.beats) {
          expect(b.title).toBeTruthy();
          expect(b.goal).toBeTruthy();
        }
      }
    }
  });

  it('转换助手产出正确形状', () => {
    const t = BEAT_TEMPLATES[0];
    const skeleton = templateToVolumeSkeleton(t);
    expect(skeleton.chapters.length).toBe(t.chapters.length);
    expect(skeleton.chapters[0].beats[0].goal).toBeTruthy();
    expect(templateFirstChapterBeats(t).length).toBe(t.chapters[0].beats.length);
  });
});
