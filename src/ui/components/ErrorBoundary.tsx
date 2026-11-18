import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Compact inline fallback (for panels) instead of a full-screen one. */
  inline?: boolean;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/** Catches render errors so one broken panel never takes down the whole game. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // a part of the game from before an update that's no longer online: only a reload (onto the new version) helps
    const updated = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError/i.test(error.message);
    if (this.props.inline && updated)
      return (
        <div role="alert" className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <div className="font-semibold">A new version of the game is out.</div>
          <div className="mt-1 text-xs text-ink2">Reload to get it — your progress is saved.</div>
          <button type="button" className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    if (this.props.inline)
      return (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">
          <div className="font-semibold text-bad">This panel hit a snag.</div>
          <div className="mt-1 text-xs text-ink2">{error.message}</div>
          <button type="button" className="mt-2 rounded-lg bg-panel2 px-3 py-1.5 text-xs font-semibold" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-ink">
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink2">Your progress is saved as you play. Reloading usually fixes this.</p>
          <p className="mt-2 text-xs text-ink3">{error.message}</p>
          <button type="button" className="mt-4 rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
