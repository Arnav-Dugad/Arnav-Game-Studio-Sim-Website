import { useEffect, useRef } from 'react';
import type { GameState } from '@/sim/types';
import { OfficeRenderer, type RendererCallbacks, type RendererUI } from './OfficeRenderer';

export interface OfficeCanvasProps {
  getState: () => GameState | null;
  getUI: () => RendererUI;
  onTileClick?: RendererCallbacks['onTileClick'];
  onItemClick?: RendererCallbacks['onItemClick'];
  onStaffClick?: RendererCallbacks['onStaffClick'];
  onCancel?: RendererCallbacks['onCancel'];
  onRotate?: RendererCallbacks['onRotate'];
  onPaint?: RendererCallbacks['onPaint'];
  onPaintEnd?: RendererCallbacks['onPaintEnd'];
  onReady?: (r: OfficeRenderer) => void;
  className?: string;
  ariaLabel?: string;
}

/** Mounts the Pixi office renderer. Callbacks are read through refs so they can change freely. */
export function OfficeCanvas(props: OfficeCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const cbRef = useRef(props);
  useEffect(() => {
    cbRef.current = props;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const r = new OfficeRenderer({
      getState: () => cbRef.current.getState(),
      getUI: () => cbRef.current.getUI(),
      onTileClick: (x, y, f) => cbRef.current.onTileClick?.(x, y, f),
      onItemClick: (it) => cbRef.current.onItemClick?.(it),
      onStaffClick: (id) => cbRef.current.onStaffClick?.(id),
      onCancel: () => cbRef.current.onCancel?.(),
      onRotate: () => cbRef.current.onRotate?.(),
      onPaint: (x, y, f) => cbRef.current.onPaint?.(x, y, f),
      onPaintEnd: () => cbRef.current.onPaintEnd?.(),
    });
    let alive = true;
    r.init(el)
      .then(() => {
        if (alive) cbRef.current.onReady?.(r);
      })
      .catch((e) => console.error('Renderer failed to start', e));
    return () => {
      alive = false;
      r.destroy();
      el.innerHTML = '';
    };
  }, []);

  return <div ref={host} className={props.className} role="img" aria-label={props.ariaLabel ?? 'Your office'} />;
}
