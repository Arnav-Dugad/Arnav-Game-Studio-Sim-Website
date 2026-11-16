import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/services/auth';
import { loadSlot, SLOT_IDS, type SlotId } from '@/services/saves';
import { useRoute, navigate } from './router';
import { useGame } from './store';
import { Landing } from './screens/Landing';
import { AuthScreen } from './screens/AuthScreen';
import { SlotsScreen } from './screens/SlotsScreen';
import { GameLogo } from './art/EventArt';
import { sound } from './sound';

const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const ArtGallery = lazy(() => import('./art/ArtGallery').then((m) => ({ default: m.ArtGallery })));

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-ink2">
        <div className="animate-pulse">
          <GameLogo size={56} />
        </div>
        <span className="text-sm">{text}</span>
      </div>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const { user, ready, init } = useAuth();
  useEffect(() => init(), [init]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const [head, arg] = route;
  if (head === 'gallery' && import.meta.env.DEV)
    return (
      <Suspense fallback={<Splash />}>
        <ArtGallery />
      </Suspense>
    );
  if (!head) return <Landing />;
  if (head === 'login' || head === 'signup' || head === 'reset') return <AuthScreen key={head} mode={head} />;
  if (!ready) return <Splash />;
  if (!user) {
    queueMicrotask(() => navigate('login', true));
    return <Splash />;
  }
  if (head === 'slots') return <SlotsScreen />;
  if (head === 'play' && arg && (SLOT_IDS as readonly string[]).includes(arg)) return <PlayRoute slotId={arg as SlotId} uid={user.uid} />;
  queueMicrotask(() => navigate('', true));
  return <Splash />;
}

function PlayRoute({ slotId, uid }: { slotId: SlotId; uid: string }) {
  const loaded = useGame((g) => g.s !== null && g.slotId === slotId && g.uid === uid);
  const [error, setError] = useState('');
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    loadSlot(uid, slotId)
      .then((s) => alive && useGame.getState().load(s, slotId, uid))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [loaded, uid, slotId]);
  if (error)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">Couldn’t open this save.</p>
          <p className="mt-1 text-sm text-ink3">{error}</p>
          <button className="mt-4 rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink" onClick={() => navigate('slots')}>
            Back to saves
          </button>
        </div>
      </div>
    );
  if (!loaded) return <Splash text="Opening your studio…" />;
  return (
    <Suspense fallback={<Splash text="Opening your studio…" />}>
      <GameScreen slotId={slotId} />
    </Suspense>
  );
}
