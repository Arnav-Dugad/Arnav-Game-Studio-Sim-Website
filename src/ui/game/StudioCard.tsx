import { useRef, useState } from 'react';
import { fromDay } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { Avatar } from '../art/Avatar';
import { Cover } from '../art/Cover';
import { Mascot } from '../art/Mascot';
import { Button, Modal } from '../components/ui';
import { useGame } from '../store';

const W = 1200;
const H = 630;
const SANS = "'Inter','Segoe UI',system-ui,sans-serif";

/** Resolve CSS custom properties so the SVG renders the same as a standalone image. */
function resolveVars(markup: string): string {
  const cs = getComputedStyle(document.documentElement);
  return markup.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => cs.getPropertyValue(name).trim().replace(/"/g, "'") || fallback || 'inherit');
}

async function svgToPng(svg: SVGSVGElement): Promise<Blob | null> {
  let markup = new XMLSerializer().serializeToString(svg);
  if (!markup.includes('xmlns="http://www.w3.org/2000/svg"')) markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  markup = resolveVars(markup).replace('width="100%"', `width="${W * 2}" height="${H * 2}"`); // rasterise at full size
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, W * 2, H * 2);
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A shareable summary of the run: name, years, the numbers, the best games and the founder. */
export function StudioCardModal({ onClose }: { onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const ref = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const st = s.progress.stats;
  const year = fromDay(s.day).year;
  const founder = s.staff['founder'];
  const best = Object.values(s.releases)
    .filter((r) => !r.concept.expansionOf)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const staffN = Object.keys(s.staff).length;
  const awards = st.awardsWon ?? 0;
  const tiles: [string, string][] = [
    ['Games released', String(s.releaseOrder.length)],
    ['Copies sold', fmtUnits(st.totalUnits ?? 0)],
    ['Hits (85+)', String(st.hits ?? 0)],
    ['Awards', String(awards)],
    ['People', String(staffN)],
    [s.finance.stock ? 'Your stake (peak)' : 'Peak valuation', fmtMoney(st.peakValuation ?? 0)],
  ];
  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    let blob: Blob | null;
    try {
      blob = await svgToPng(ref.current);
    } catch {
      blob = null;
    }
    setBusy(false);
    const g = useGame.getState();
    if (!blob) return g.toast({ text: 'Couldn’t make the image', tone: 'bad' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.company.name.replace(/[^\w -]+/g, '').trim() || 'studio'} card ${year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    g.toast({ text: 'Studio card saved', tone: 'good', icon: 'camera' });
  };
  return (
    <Modal open onClose={onClose} title="Studio card" wide>
      <div className="mt-8 overflow-hidden rounded-xl border border-line">
        <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${s.company.name} studio card`}>
          <defs>
            <linearGradient id="sc-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b1f1a" />
              <stop offset="1" stopColor="#4a2a22" />
            </linearGradient>
            <radialGradient id="sc-glow" cx="0.82" cy="0.3" r="0.6">
              <stop offset="0" stopColor="#e07a5f" stopOpacity="0.45" />
              <stop offset="1" stopColor="#e07a5f" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} fill="url(#sc-bg)" />
          <rect width={W} height={H} fill="url(#sc-glow)" />
          {/* name & years */}
          <text x={64} y={92} fill="#f2c450" fontFamily={SANS} fontSize={20} fontWeight={700} letterSpacing="0.2em">
            {`EST. ${s.settings.startYear} · ${year}`}
          </text>
          <text x={64} y={160} fill="#fff4e6" fontFamily={SANS} fontSize={Math.min(64, Math.floor(590 / Math.max(1, s.company.name.length * 0.6)))} fontWeight={800}>
            {s.company.name}
          </text>
          <text x={64} y={204} fill="#e8d5c4" fontFamily={SANS} fontSize={22}>
            {st.bestGame ? `Best game: ${st.bestGame} (${st.bestScore})` : 'Just getting started'}
          </text>
          {/* stats */}
          {tiles.map(([label, value], i) => {
            const x = 64 + (i % 3) * 200;
            const y = 252 + Math.floor(i / 3) * 118;
            return (
              <g key={label}>
                <rect x={x} y={y} width={184} height={100} rx={16} fill="#ffffff" fillOpacity={0.07} stroke="#ffffff" strokeOpacity={0.12} />
                <text x={x + 18} y={y + 56} fill="#fff4e6" fontFamily={SANS} fontSize={value.length > 7 ? 28 : 36} fontWeight={800}>
                  {value}
                </text>
                <text x={x + 18} y={y + 82} fill="#d9c3b0" fontFamily={SANS} fontSize={15}>
                  {label}
                </text>
              </g>
            );
          })}
          {/* founder */}
          {founder && (
            <g transform="translate(64 510)">
              <circle cx={36} cy={36} r={38} fill="#f2c450" fillOpacity={0.25} />
              <g transform="translate(0 0)">
                <Avatar seed={founder.look} size={72} mood={80} />
              </g>
              <text x={92} y={32} fill="#fff4e6" fontFamily={SANS} fontSize={22} fontWeight={700}>
                {founder.name}
              </text>
              <text x={92} y={58} fill="#d9c3b0" fontFamily={SANS} fontSize={16}>
                Founder & CEO
              </text>
            </g>
          )}
          {/* best games, fanned */}
          {/* the best game in the middle, on top: draw the sides first */}
          {(best.length === 3 ? [[best[1]!, 0], [best[2]!, 2], [best[0]!, 1]] as const : best.map((r, i) => [r, i] as const)).map(([r, i]) => {
            const n = best.length;
            const x = 910 + (i - (n - 1) / 2) * 135;
            const rot = (i - (n - 1) / 2) * 7;
            return (
              <g key={r.id} transform={`translate(${x} ${320 + Math.abs(i - (n - 1) / 2) * 18}) rotate(${rot}) translate(-115 -153)`}>
                <rect x={7} y={12} width={230} height={307} rx={12} fill="#000" opacity={0.3} />
                <Cover title={r.name} genre={r.concept.genre} topic={r.concept.topic} seed={r.coverSeed ?? r.day} design={r.concept.cover} size={230} score={r.score} />
              </g>
            );
          })}
          {!best.length && (
            <text x={910} y={330} textAnchor="middle" fill="#d9c3b0" fontFamily={SANS} fontSize={22}>
              Your best games will appear here
            </text>
          )}
          {s.company.mascot && (
            <g transform="translate(520 470)">
              <Mascot m={s.company.mascot} size={120} />
            </g>
          )}
          <text x={W - 48} y={H - 36} textAnchor="end" fill="#d9c3b0" fontFamily={SANS} fontSize={16} opacity={0.8}>
            Arnav Game Studio Empire
          </text>
          {awards > 0 && (
            <text x={W - 48} y={72} textAnchor="end" fill="#f2c450" fontFamily={SANS} fontSize={28}>
              {'🏆'.repeat(Math.min(5, awards))}
            </text>
          )}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink3">A snapshot of your run so far — save it and show it off.</p>
        <Button variant="primary" icon="camera" disabled={busy} onClick={() => void download()}>
          {busy ? 'Saving…' : 'Save image'}
        </Button>
      </div>
    </Modal>
  );
}
