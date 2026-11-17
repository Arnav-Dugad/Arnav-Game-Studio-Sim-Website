import { useCallback, useEffect, useState } from 'react';
import { createGame } from '@/sim/create';
import { fmtMoney } from '@/sim/util';
import type { Difficulty } from '@/data/balance';
import { useAuth } from '@/services/auth';
import { adoptGuestSaves, cloudSlotStatus, deleteSlot, ensureProfile, getHallOfFame, listSlots, loadSlot, saveLocal, syncSlot, type HallEntry, type SlotId, type SlotInfo } from '@/services/saves';
import { Wordmark } from '../art/EventArt';
import { CompanyBadge } from '../art/CompanyBadge';
import { Button, Field, Modal, Pill, Segmented, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { useGame } from '../store';
import { navigate } from '../router';
import { useSettings } from '../settings';
import { sound } from '../sound';
import { WhatsNew } from '../game/WhatsNew';
import { exportSave, readSaveFile } from '../saveFiles';

const COLORS = ['#e07a5f', '#3d85c6', '#9b6bd3', '#2eb5a8', '#e3b23c', '#d1495b', '#5f9e6e', '#334155'];

export function SlotsScreen() {
  const user = useAuth((a) => a.user)!;
  const signOut = useAuth((a) => a.signOut);
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [hall, setHall] = useState<HallEntry[]>([]);
  const [creating, setCreating] = useState<SlotId | null>(null);
  const [loading, setLoading] = useState<SlotId | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDel, setConfirmDel] = useState<SlotId | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSlots(await listSlots(user.uid));
      setHall(await getHallOfFame(user.uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSlots([]);
    }
  }, [user.uid]);

  useEffect(() => {
    let alive = true;
    void ensureProfile(user.uid, user.email, user.displayName);
    (async () => {
      try {
        if (!user.guest) await adoptGuestSaves(user.uid).catch(() => 0);
        const [sl, hf] = await Promise.all([listSlots(user.uid), getHallOfFame(user.uid)]);
        if (!alive) return;
        setSlots(sl);
        setHall(hf);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setSlots([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.uid, user.email, user.displayName]);

  const open = async (slotId: SlotId, prefer?: 'local' | 'cloud') => {
    setLoading(slotId);
    setError('');
    try {
      const s = await loadSlot(user.uid, slotId, prefer);
      useGame.getState().load(s, slotId, user.uid);
      sound.unlock();
      navigate(`play/${slotId}`);
    } catch (e) {
      setError(`Couldn’t load that save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
    }
  };

  const exportSlot = async (slotId: SlotId) => {
    setError('');
    try {
      exportSave(await loadSlot(user.uid, slotId));
    } catch (e) {
      setError(`Couldn’t export that save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const importInto = async (slotId: SlotId, input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const s = await readSaveFile(file);
      // Never overwrite a save another device put in this slot after we listed it.
      const cloud = await cloudSlotStatus(user.uid, slotId);
      if (cloud === 'taken') {
        setError('That slot already has a save in the cloud (maybe from another device). Refreshing the list — pick an empty slot.');
        void refresh();
        return;
      }
      if (cloud === 'unknown') {
        setError('Couldn’t check your cloud saves right now, so the import was cancelled to keep them safe. Try again when you’re online.');
        return;
      }
      await saveLocal(user.uid, slotId, s);
      if (!user.guest) void syncSlot(user.uid, slotId).catch(() => 'offline');
      setNotice(`${s.company.name} imported into slot ${slotId.replace('slot', '')}.`);
      void refresh();
    } catch (e) {
      setError(`Couldn’t import that file: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <button type="button" onClick={() => navigate('')} aria-label="Home">
          <Wordmark />
        </button>
        <div className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          <span className="hidden text-ink2 sm:inline">
            {user.guest ? 'Guest (this device only)' : (user.displayName ?? user.email)}
          </span>
          {user.guest ? (
            <Button size="sm" variant="primary" onClick={() => navigate('signup')}>
              Create account
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            icon="logout"
            onClick={async () => {
              useGame.getState().unload();
              await signOut();
              navigate('');
            }}
          >
            {user.guest ? 'Exit' : 'Sign out'}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <h1 className="font-display text-3xl font-bold">Your studios</h1>
        <p className="mt-1 text-sm text-ink2">{user.guest ? 'Guest saves live in this browser. Create an account to sync them to the cloud.' : 'Saves sync to the cloud and are kept on this device for offline play.'}</p>
        <WhatsNew />
        {notice && (
          <div role="status" className="mt-4 rounded-xl bg-good/10 p-3 text-sm text-good">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">
            {error}
          </div>
        )}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {!slots &&
            Array.from({ length: 4 }, (_, i) => <li key={i} className="h-36 animate-pulse rounded-2xl bg-bg2" />)}
          {slots?.map((sl, i) => {
            const meta = sl.newest === 'cloud' ? sl.cloud : sl.local;
            if (!meta)
              return (
                <li key={sl.slotId} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setCreating(sl.slotId)}
                    className="grid min-h-36 w-full flex-1 place-items-center rounded-2xl border-2 border-dashed border-line text-ink3 transition hover:border-accent hover:text-accent"
                  >
                    <span className="flex flex-col items-center gap-1">
                      <Icon name="plus" size={24} />
                      <span className="text-sm font-semibold">New studio · slot {i + 1}</span>
                    </span>
                  </button>
                  <label className="cursor-pointer self-center text-[11px] text-ink3 underline decoration-dotted hover:text-accent">
                    or import a save file
                    <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void importInto(sl.slotId, e.currentTarget)} />
                  </label>
                </li>
              );
            return (
              <li key={sl.slotId} className="rounded-2xl border border-line bg-panel2/70 p-4">
                <div className="flex items-start gap-3">
                  <CompanyBadge name={meta.companyName} color={meta.color || '#e07a5f'} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-semibold">{meta.companyName}</div>
                    <div className="text-xs text-ink3">
                      {meta.founderName} · {meta.gameDate} · {meta.difficulty}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tone={meta.cash < 0 ? 'bad' : 'good'}>{fmtMoney(meta.cash)}</Pill>
                      <Pill>rep {meta.reputation}</Pill>
                      {meta.status !== 'running' && <Pill tone="bad">{meta.status}</Pill>}
                      {!user.guest && (sl.local && !sl.local.synced ? <Pill tone="gold">Not synced yet</Pill> : sl.cloud ? <Pill tone="tech">Cloud</Pill> : null)}
                    </div>
                  </div>
                </div>
                {sl.conflict && (
                  <div className="mt-3 rounded-xl bg-warn/10 p-2 text-xs">
                    <b>Two different saves found.</b> This device has unsynced progress ({sl.local?.gameDate}) and the cloud has a newer save ({sl.cloud?.gameDate}).
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => open(sl.slotId, 'local')}>
                        Use this device’s
                      </Button>
                      <Button size="sm" onClick={() => open(sl.slotId, 'cloud')}>
                        Use cloud
                      </Button>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  {confirmDel === sl.slotId ? (
                    <Button
                      size="sm"
                      variant="danger"
                      icon="trash"
                      onClick={async () => {
                        await deleteSlot(user.uid, sl.slotId);
                        if (useGame.getState().slotId === sl.slotId) useGame.getState().unload();
                        setConfirmDel(null);
                        void refresh();
                      }}
                      onBlur={() => setConfirmDel(null)}
                    >
                      Delete forever
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirmDel(sl.slotId)} aria-label={`Delete ${meta.companyName}`}>
                      Delete
                    </Button>
                  )}
                  {!sl.conflict && <Button size="sm" variant="ghost" icon="download" onClick={() => void exportSlot(sl.slotId)} aria-label={`Export ${meta.companyName} to a file`} title="Download this save as a file (backup or move it to another device)">
                    Export
                  </Button>}
                  {!sl.conflict && (
                    <Button variant="primary" icon="play" onClick={() => open(sl.slotId)} disabled={loading !== null}>
                      {loading === sl.slotId ? 'Loading…' : meta.status === 'running' ? 'Continue' : 'View ending'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {hall.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold">Hall of Fame</h2>
            <ol className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {hall.slice(0, 10).map((h, i) => (
                <li key={`${h.company}-${h.day}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cx('num w-6 font-display font-bold', i === 0 ? 'text-gold' : 'text-ink3')}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{h.company}</div>
                    <div className="truncate text-xs text-ink3">
                      {h.ending} · {h.years}
                      {h.cheats ? ' · cheats used' : ''}
                      {h.bestGame ? ` · best: ${h.bestGame} (${h.bestScore})` : ''}
                    </div>
                  </div>
                  <span className="num font-semibold">{h.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      {creating && (
        <NewStudioModal
          onClose={() => setCreating(null)}
          onCreate={async (opts) => {
            const s = createGame({ seed: Math.floor(Math.random() * 2 ** 31), ...opts });
            // A stale list could show a slot as empty that another device has since filled.
            if ((await cloudSlotStatus(user.uid, creating)) === 'taken') {
              setError('That slot already has a save in the cloud (maybe from another device). Refreshing the list — pick an empty slot.');
              setCreating(null);
              void refresh();
              return;
            }
            try {
              await saveLocal(user.uid, creating, s);
            } catch (e) {
              setError(`Couldn’t create the save: ${e instanceof Error ? e.message : String(e)}`);
              setCreating(null);
              return;
            }
            void syncSlot(user.uid, creating).catch(() => undefined);
            useGame.getState().load(s, creating, user.uid);
            sound.unlock();
            if (!opts.tutorial) useGame.getState().act({ type: 'tutorial', step: 99 });
            useSettings.getState().set({ showTutorial: opts.tutorial });
            setCreating(null);
            navigate(`play/${creating}`);
          }}
        />
      )}
    </div>
  );
}

interface NewOpts {
  companyName: string;
  founderName: string;
  color: string;
  difficulty: Difficulty;
  startYear: number;
  founderFocus: 'design' | 'programming' | 'balanced';
  endless: boolean;
  tutorial: boolean;
  sandbox: boolean;
}

function NewStudioModal({ onClose, onCreate }: { onClose: () => void; onCreate: (o: NewOpts) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const user = useAuth((a) => a.user);
  const [o, setO] = useState<NewOpts>({
    companyName: '',
    founderName: user?.displayName && !user.guest ? user.displayName : '',
    color: COLORS[0]!,
    difficulty: 'standard',
    startYear: 1980,
    founderFocus: 'balanced',
    endless: false,
    tutorial: true,
    sandbox: false,
  });
  const [err, setErr] = useState('');
  const set = <K extends keyof NewOpts>(k: K, v: NewOpts[K]) => setO((x) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title="Found a new studio">
      <h2 className="font-display text-2xl font-semibold">Found a new studio</h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!o.companyName.trim()) return setErr('Name your studio.');
          if (!o.founderName.trim()) return setErr('Who is the founder?');
          if (busy) return;
          setBusy(true);
          void onCreate({ ...o, companyName: o.companyName.trim().slice(0, 40), founderName: o.founderName.trim().slice(0, 40) }).finally(() => setBusy(false));
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Studio name">
            <input className={inputCls} value={o.companyName} maxLength={40} onChange={(e) => set('companyName', e.target.value)} placeholder="Garage Dreams Interactive" autoFocus />
          </Field>
          <Field label="Founder (you)">
            <input className={inputCls} value={o.founderName} maxLength={40} onChange={(e) => set('founderName', e.target.value)} placeholder="Your name" />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-ink2">Studio colour</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Studio colour">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={o.color === c}
                aria-label={c}
                onClick={() => set('color', c)}
                className={cx('size-8 rounded-full ring-offset-2 ring-offset-[var(--panel)] transition', o.color === c && 'ring-2 ring-ink')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <Field label="Founder strengths">
          <Segmented
            ariaLabel="Founder strengths"
            value={o.founderFocus}
            onChange={(v) => set('founderFocus', v)}
            options={[
              { value: 'design', label: 'Designer' },
              { value: 'balanced', label: 'All-rounder' },
              { value: 'programming', label: 'Programmer' },
            ]}
          />
        </Field>
        <Field label="Start year" hint={o.startYear === 1980 ? 'The full story — recommended.' : 'Later starts give you the era’s standard tech but tougher, more crowded markets.'}>
          <Segmented ariaLabel="Start year" value={o.startYear} onChange={(v) => set('startYear', v)} options={[1980, 1985, 1995, 2005, 2015].map((y) => ({ value: y, label: String(y) }))} />
        </Field>
        <Field label="Difficulty">
          <Segmented<Difficulty>
            ariaLabel="Difficulty"
            value={o.difficulty}
            onChange={(v) => set('difficulty', v)}
            options={[
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'standard', label: 'Standard' },
              { value: 'hardcore', label: 'Hardcore' },
            ]}
          />
        </Field>
        <div className="space-y-2 text-sm">
          <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 px-3 py-2">
            <span>
              Endless mode <span className="block text-xs text-ink3">Keep going past 2026 with procedural future hardware.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={o.endless} onChange={(e) => set('endless', e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 px-3 py-2">
            <span>
              Sandbox mode <span className="block text-xs text-ink3">Infinite money, free building, no bankruptcy — plus every cheat. Marked as cheated in the Hall of Fame.</span>
            </span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={o.sandbox} onChange={(e) => set('sandbox', e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 px-3 py-2">
            <span>Show the tutorial</span>
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={o.tutorial} onChange={(e) => set('tutorial', e.target.checked)} />
          </label>
        </div>
        {err && (
          <p role="alert" className="text-sm text-bad">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon="rocket" disabled={busy}>
            {busy ? 'Opening…' : 'Open the garage'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
