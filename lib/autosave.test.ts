import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutosaveController } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutosaveController', () => {
  it('防抖 500ms 后保存最后一次值', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    c.schedule('b');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
    expect(c.getState()).toBe('saved');
  });

  it('flush 立即保存并取消挂起定时器', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    await c.flush();
    expect(save).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('失败保留待存值，retry 后恢复', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('网络错误')).mockResolvedValueOnce(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    expect(c.getState()).toBe('error');
    c.retry();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(c.getState()).toBe('saved');
  });

  it('状态回调按序触发', () => {
    const states: string[] = [];
    const c = new AutosaveController(vi.fn().mockResolvedValue(undefined), 500, (s) => states.push(s));
    c.schedule('a');
    expect(states).toContain('pending');
    expect(c.getState()).toBe('pending');
  });

  it('dispose 时尽力保存待存内容', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    c.dispose();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith('a');
  });

  it('discard 丢弃待存且不调用保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    c.discard();
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    expect(c.getState()).toBe('idle');
  });
});
