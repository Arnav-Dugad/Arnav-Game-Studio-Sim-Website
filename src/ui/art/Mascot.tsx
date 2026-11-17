import type { MascotDesign } from '@/sim/types';

/** The studio mascot, drawn from simple parts (species, colour, accessory). Same design as the office statue. */
export function Mascot({ m, size = 96 }: { m: MascotDesign; size?: number }) {
  const c = m.color;
  const dark = '#2a2622';
  const ears = () => {
    switch (m.kind) {
      case 'bear':
        return (
          <>
            <circle cx={32} cy={28} r={9} fill={c} />
            <circle cx={68} cy={28} r={9} fill={c} />
            <circle cx={32} cy={28} r={4} fill={dark} opacity={0.25} />
            <circle cx={68} cy={28} r={4} fill={dark} opacity={0.25} />
          </>
        );
      case 'cat':
        return (
          <>
            <path d="M26 40L30 16L44 30Z" fill={c} />
            <path d="M74 40L70 16L56 30Z" fill={c} />
          </>
        );
      case 'robot':
        return (
          <>
            <rect x={48} y={10} width={4} height={14} fill={dark} />
            <circle cx={50} cy={10} r={4} fill="#f2c450" />
          </>
        );
      case 'dragon':
        return (
          <>
            <path d="M34 30L26 12L42 26Z" fill="#f2e2b8" />
            <path d="M66 30L74 12L58 26Z" fill="#f2e2b8" />
          </>
        );
      case 'bird':
        return <path d="M44 22Q50 6 56 22Z" fill={c} />;
      default:
        return null;
    }
  };
  const head = m.kind === 'robot' ? <rect x={26} y={22} width={48} height={42} rx={10} fill={c} /> : <circle cx={50} cy={46} r={24} fill={c} />;
  return (
    <svg viewBox="0 0 100 110" width={size} height={(size * 110) / 100} role="img" aria-label={`Mascot: a ${m.kind}`}>
      {/* body */}
      <ellipse cx={50} cy={92} rx={22} ry={16} fill={c} />
      <ellipse cx={50} cy={96} rx={13} ry={9} fill="#ffffff" opacity={0.35} />
      {ears()}
      {head}
      {/* face */}
      <circle cx={41} cy={44} r={4.5} fill="#ffffff" />
      <circle cx={59} cy={44} r={4.5} fill="#ffffff" />
      <circle cx={42} cy={45} r={2.2} fill={dark} />
      <circle cx={60} cy={45} r={2.2} fill={dark} />
      {m.kind === 'bird' ? <path d="M44 52L56 52L50 60Z" fill="#f2c450" /> : <path d="M43 55Q50 61 57 55" stroke={dark} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
      {m.kind === 'dragon' && <path d="M70 92Q90 96 86 78" stroke={c} strokeWidth={6} fill="none" strokeLinecap="round" />}
      {/* accessory */}
      {m.acc === 'cap' && <path d="M28 34Q50 12 72 34Z M66 32L84 34L72 36Z" fill="#3d85c6" />}
      {m.acc === 'headphones' && (
        <>
          <path d="M26 46Q26 18 50 18Q74 18 74 46" stroke={dark} strokeWidth={4} fill="none" />
          <rect x={21} y={40} width={9} height={14} rx={3} fill="#d8323c" />
          <rect x={70} y={40} width={9} height={14} rx={3} fill="#d8323c" />
        </>
      )}
      {m.acc === 'star' && (
        <>
          <path d="M28 86L14 70" stroke={dark} strokeWidth={3} strokeLinecap="round" />
          <path d="M14 62L16.5 67.5L22 68L17.8 71.5L19 77L14 74L9 77L10.2 71.5L6 68L11.5 67.5Z" fill="#f2c450" />
        </>
      )}
      {m.acc === 'crown' && <path d="M34 26L38 14L44 22L50 10L56 22L62 14L66 26Z" fill="#f2c450" />}
    </svg>
  );
}
