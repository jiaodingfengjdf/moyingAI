import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { getSetting, setSetting } from './settings';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('settings repo', () => {
  it('读写与覆盖', () => {
    expect(getSetting('ai.model', db)).toBeNull();
    setSetting('ai.model', 'deepseek-chat', db);
    expect(getSetting('ai.model', db)).toBe('deepseek-chat');
    setSetting('ai.model', 'deepseek-reasoner', db);
    expect(getSetting('ai.model', db)).toBe('deepseek-reasoner');
  });

  it('不同键互不影响', () => {
    setSetting('ai.apiKey', 'sk-123', db);
    setSetting('ai.baseUrl', 'https://api.deepseek.com', db);
    expect(getSetting('ai.apiKey', db)).toBe('sk-123');
    expect(getSetting('ai.baseUrl', db)).toBe('https://api.deepseek.com');
  });
});
