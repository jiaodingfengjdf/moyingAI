import { useCallback, useEffect, useRef, useState } from 'react';
import { AutosaveController, type SaveFn, type SaveState } from './autosave';

export function useAutosave(save: SaveFn, delay = 500) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const controllerRef = useRef<AutosaveController | null>(null);
  const [state, setState] = useState<SaveState>('idle');

  if (!controllerRef.current) {
    controllerRef.current = new AutosaveController((value) => saveRef.current(value), delay, setState);
  }
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  const schedule = useCallback((value: string) => controller.schedule(value), [controller]);
  const flush = useCallback(() => controller.flush(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);

  return { state, schedule, flush, retry };
}
