import { useCallback, useRef, useState } from 'react';

export interface BranchState {
  id: string;
  label: string;
  text: string;
  done: boolean;
}

export interface AIStreamState {
  kind: 'ghostwrite' | 'rewrite' | 'style' | null;
  requestId: string | null;
  branches: BranchState[];
  loading: boolean;
  error: string | null;
}

const IDLE: AIStreamState = { kind: null, requestId: null, branches: [], loading: false, error: null };

export function useAIStream() {
  const [state, setState] = useState<AIStreamState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRef = useRef<{ url: string; body: unknown; kind: 'ghostwrite' | 'rewrite' | 'style'; labels: string[] } | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) => ({ ...s, loading: false }));
  }, []);

  const clear = useCallback(() => setState(IDLE), []);

  const run = useCallback(async (url: string, body: unknown, kind: 'ghostwrite' | 'rewrite' | 'style', labels: string[]) => {
    lastRef.current = { url, body, kind, labels };
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({
      kind,
      requestId: null,
      branches: labels.map((label, id) => ({ id: String(id), label, text: '', done: false })),
      loading: true,
      error: null,
    });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `请求失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          let event: { type: string; branch?: number; text?: string; requestId?: string; message?: string };
          try {
            event = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }
          setState((s) => {
            if (event.type === 'meta' && event.requestId) return { ...s, requestId: event.requestId };
            if (event.type === 'delta' && typeof event.branch === 'number') {
              const branches = s.branches.map((b, i) => (i === event.branch ? { ...b, text: b.text + (event.text ?? '') } : b));
              return { ...s, branches };
            }
            if (event.type === 'done' && typeof event.branch === 'number') {
              const branches = s.branches.map((b, i) => (i === event.branch ? { ...b, done: true } : b));
              return { ...s, branches, loading: !branches.every((b) => b.done) };
            }
            if (event.type === 'error') return { ...s, error: s.error ?? event.message ?? '生成失败', loading: false };
            return s;
          });
        }
      }
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (!last) return;
    void run(last.url, last.body, last.kind, last.labels);
  }, [run]);

  return { state, run, cancel, clear, retry };
}
