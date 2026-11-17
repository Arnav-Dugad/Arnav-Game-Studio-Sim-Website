import { useId } from 'react';

/**
 * The studio's headquarters, drawn from scratch: a garage, a storefront office, a brick studio floor, a
 * studio building, a campus, a glass tower — with the company's name on the sign, the season in the sky
 * (snow in winter, blossom in spring) and lit windows at night-time colours. Pure SVG, no assets.
 */
export function StudioHQ({ tier, name, month = 6, accent = '#e07a5f', width = 320 }: { tier: number; name: string; month?: number; accent?: string; width?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const winter = month === 12 || month <= 2;
  const spring = month >= 3 && month <= 5;
  const autumn = month >= 9 && month <= 11;
  const sky = winter ? ['#cfd9e6', '#eef2f6'] : autumn ? ['#f3d3b0', '#fbeee0'] : ['#a9d3ee', '#e8f4fb'];
  const ground = winter ? '#eef1f4' : autumn ? '#c9a66b' : '#8cc47a';
  const tree = winter ? '#e6ecf1' : autumn ? '#d9822b' : spring ? '#f2a7c3' : '#4f9e57';
  const label = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  const W = 320;
  const H = 180;
  const groundY = 150;
  const win = (x: number, y: number, w = 10, h = 10, lit = true) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} rx={1.5} fill={lit ? '#ffe7a3' : '#9fb3c8'} opacity={lit ? 0.95 : 0.8} />;
  const treeAt = (x: number, s = 1) => (
    <g key={`t${x}`} transform={`translate(${x} ${groundY}) scale(${s})`}>
      <rect x={-2} y={-14} width={4} height={14} fill="#6b4a2e" />
      <circle cx={0} cy={-22} r={11} fill={tree} />
      <circle cx={-7} cy={-16} r={7} fill={tree} />
      <circle cx={7} cy={-16} r={7} fill={tree} />
    </g>
  );
  const sign = (x: number, y: number, w: number) => (
    <g>
      <rect x={x} y={y} width={w} height={14} rx={3} fill="#2a2622" />
      <text x={x + w / 2} y={y + 9.5} textAnchor="middle" fontSize={Math.min(8, (w - 6) / Math.max(1, label.length * 0.66))} fontWeight={800} fill="#fff4e6" fontFamily="'Inter','Segoe UI',system-ui,sans-serif" letterSpacing="0.04em">
        {label.toUpperCase()}
      </text>
    </g>
  );
  let building: React.ReactNode;
  switch (Math.max(1, Math.min(6, tier))) {
    case 1:
      // a suburban house with a garage
      building = (
        <g>
          <path d="M90 150V100L130 72L170 100V150Z" fill="#e8dcc6" />
          <path d="M84 102L130 66L176 102" stroke="#8a4a3a" strokeWidth={8} fill="none" strokeLinejoin="round" />
          <rect x={170} y={108} width={70} height={42} fill="#d9cdb6" />
          <path d="M166 110L205 92L244 110" stroke="#8a4a3a" strokeWidth={6} fill="none" strokeLinejoin="round" />
          <rect x={178} y={116} width={54} height={34} fill="#b8b0a2" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={178} y={118 + i * 8} width={54} height={1.5} fill="#9a9284" />
          ))}
          {win(104, 110, 14, 12)}
          {win(140, 110, 14, 12, false)}
          <rect x={122} y={124} width={16} height={26} fill="#7a5236" />
          {sign(180, 98, 50)}
        </g>
      );
      break;
    case 2:
      // a storefront office on a high street
      building = (
        <g>
          <rect x={80} y={70} width={160} height={80} fill="#e9e2d6" />
          <rect x={80} y={64} width={160} height={8} fill="#cfc5b4" />
          <rect x={92} y={110} width={136} height={40} fill="#5d7f99" />
          <rect x={150} y={112} width={20} height={38} fill="#2f4d63" />
          {[100, 128, 186, 214].map((x) => win(x, 82, 14, 16))}
          <path d={`M88 104H232L224 96H96Z`} fill={accent} />
          {sign(110, 88, 100)}
        </g>
      );
      break;
    case 3:
      // a brick building; the studio has a whole floor
      building = (
        <g>
          <rect x={70} y={44} width={180} height={106} fill="#b5654a" />
          {Array.from({ length: 9 }, (_, r) => (
            <rect key={r} x={70} y={50 + r * 11} width={180} height={0.8} fill="#9a523b" opacity={0.6} />
          ))}
          {[0, 1, 2].map((row) => [88, 120, 152, 184, 216].map((x) => win(x, 54 + row * 26, 14, 16, row === 1 || (x + row) % 3 === 0)))}
          <rect x={150} y={128} width={20} height={22} fill="#3d2a20" />
          <rect x={70} y={74} width={180} height={4} fill={accent} />
          {sign(105, 108, 110)}
        </g>
      );
      break;
    case 4:
      // the studio's own building
      building = (
        <g>
          <rect x={90} y={30} width={140} height={120} fill="#dfe5ea" />
          <rect x={90} y={30} width={140} height={10} fill={accent} />
          {[0, 1, 2, 3].map((row) => [104, 128, 152, 176, 200].map((x) => win(x, 48 + row * 22, 14, 14, (row + x / 8) % 3 !== 0)))}
          <rect x={146} y={126} width={28} height={24} fill="#4a5a6a" />
          <rect x={60} y={96} width={30} height={54} fill="#cfd6dc" />
          <rect x={230} y={96} width={30} height={54} fill="#cfd6dc" />
          {sign(110, 16, 100)}
        </g>
      );
      break;
    case 5:
      // a campus: a main hall, two wings, a lawn
      building = (
        <g>
          <rect x={40} y={90} width={70} height={60} rx={4} fill="#e4e8ec" />
          <rect x={210} y={90} width={70} height={60} rx={4} fill="#e4e8ec" />
          <rect x={110} y={50} width={100} height={100} rx={6} fill="#f2f4f6" />
          <path d="M110 56Q160 30 210 56" fill={accent} />
          {[0, 1, 2].map((row) => [122, 146, 170, 194].map((x) => win(x, 66 + row * 22, 12, 14, (row + x) % 4 !== 0)))}
          {[0, 1].map((row) => [50, 72, 94, 220, 242, 264].map((x) => win(x - 6, 100 + row * 20, 10, 12, (row + x) % 3 !== 0)))}
          <rect x={148} y={124} width={24} height={26} fill="#4a6a5a" />
          {sign(115, 132, 90)}
        </g>
      );
      break;
    default:
      // a glass tower that owns the skyline
      building = (
        <g>
          <rect x={60} y={80} width={40} height={70} fill="#b8c4cf" opacity={0.8} />
          <rect x={230} y={70} width={44} height={80} fill="#b8c4cf" opacity={0.8} />
          <path d="M120 150V24L160 8L200 24V150Z" fill={`url(#glass${uid})`} />
          <path d="M160 8V150" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
          {Array.from({ length: 11 }, (_, r) => (
            <rect key={r} x={120} y={34 + r * 10} width={80} height={1} fill="#ffffff" opacity={0.35} />
          ))}
          <rect x={150} y={2} width={20} height={6} rx={2} fill={accent} />
          {sign(116, 134, 88)}
        </g>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: width, height: 'auto' }} role="img" aria-label={`${name}’s headquarters`} className="mx-auto block">
      <defs>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <linearGradient id={`glass${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fb6dc" />
          <stop offset="1" stopColor="#2f5d82" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx={14} fill={`url(#sky${uid})`} />
      <circle cx={270} cy={34} r={14} fill={winter ? '#ffffff' : '#ffe08a'} opacity={0.9} />
      <rect x={0} y={groundY} width={W} height={H - groundY} fill={ground} />
      <rect x={0} y={groundY + 12} width={W} height={8} fill="#9a9a9a" opacity={0.5} />
      {treeAt(30, 0.9)}
      {building}
      {treeAt(296, 1)}
      {winter &&
        Array.from({ length: 26 }, (_, i) => <circle key={i} cx={(i * 53) % W} cy={(i * 37) % groundY} r={1.6} fill="#ffffff" opacity={0.85} />)}
      {spring &&
        Array.from({ length: 10 }, (_, i) => <circle key={i} cx={(i * 71) % W} cy={20 + ((i * 29) % 110)} r={1.4} fill="#f2a7c3" opacity={0.8} />)}
    </svg>
  );
}
