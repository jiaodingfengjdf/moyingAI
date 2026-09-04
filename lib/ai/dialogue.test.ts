import { describe, it, expect } from 'vitest';
import { buildDialogueMessages, mockDialogue, parseDialogue, personaFields } from './dialogue';
import type { Entity } from '../types';

const e = (name: string, extra: Record<string, unknown> = {}): Entity => ({
  id: name, projectId: 'p', type: 'character', name,
  aliases: [], fields: { want: '复仇', speechTic: '哼', ...extra },
  description: '', rules: [], createdAt: '', updatedAt: '',
});

describe('dialogue lib', () => {
  it('persona 读取与消息构建', () => {
    expect(personaFields(e('甲')).want).toBe('复仇');
    const msgs = buildDialogueMessages([e('甲'), e('乙', { need: '自保', speechPace: '急促' })], '分赃不均');
    expect(msgs[1].content).toContain('甲');
    expect(msgs[1].content).toContain('复仇');
    expect(msgs[1].content).toContain('自保');
    expect(msgs[0].content).toContain('JSON');
    expect(msgs[1].content).toContain('分赃不均');
  });

  it('parse 兜底与 mock', () => {
    const payload = JSON.stringify([{ speaker: '甲', line: '你背叛我。' }, { speaker: '乙', line: '是又如何？' }]);
    expect(parseDialogue(payload)).toHaveLength(2);
    expect(parseDialogue('```json\n' + payload + '\n```')[0].speaker).toBe('甲');
    expect(parseDialogue('甲：你背叛我。\n乙：是又如何？')).toHaveLength(2);
    expect(parseDialogue('乱码')).toHaveLength(0);
    expect(mockDialogue(['甲', '乙'])).toHaveLength(2);
  });
});
