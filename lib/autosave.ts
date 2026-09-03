export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type SaveFn = (value: string) => Promise<void>;
export type Listener = (state: SaveState) => void;

export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private state: SaveState = 'idle';

  constructor(
    private readonly save: SaveFn,
    private readonly delay = 500,
    private readonly onChange?: Listener,
  ) {}

  getState(): SaveState {
    return this.state;
  }

  private setState(state: SaveState): void {
    this.state = state;
    this.onChange?.(state);
  }

  schedule(value: string): void {
    this.pending = value;
    this.setState('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delay);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending === null) return;
    const value = this.pending;
    this.pending = null;
    this.setState('saving');
    try {
      await this.save(value);
      this.setState('saved');
    } catch {
      this.pending = value;
      this.setState('error');
    }
  }

  retry(): void {
    if (this.pending !== null) void this.flush();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
