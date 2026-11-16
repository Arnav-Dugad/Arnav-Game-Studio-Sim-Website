import { useId } from 'react';
import type { ReactNode } from 'react';

/*
 * Event-card vignettes (docs/ART.md §6): a soft tinted panel with a small "diorama" composed from flat
 * shapes — top faces lighter, front faces darker, one blurred-looking contact shadow. Also the studio's
 * own ORIGINAL logo mark and wordmark.
 */

const C = {
  coral: '#E07A5F',
  coralDk: '#B95A41',
  tech: '#3D85C6',
  techDk: '#2B6299',
  art: '#9B6BD3',
  audio: '#2EB5A8',
  gold: '#E3B23C',
  goldDk: '#B98A1F',
  green: '#5FA36A',
  greenDk: '#447A4E',
  ink: '#2A2622',
  paper: '#FBF6EE',
  paperDk: '#E6DCCB',
  wood: '#B98957',
  woodDk: '#8A6440',
  metal: '#9AA4B2',
  metalDk: '#6D7685',
  red: '#D1495B',
  skinA: '#EDBB94',
  skinB: '#98603D',
  skinC: '#C98B62',
  grey: '#8A8075',
};

const Shadow = ({ cx = 60, cy = 94, rx = 34 }: { cx?: number; cy?: number; rx?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.2} fill="#000000" opacity={0.18} />
);

function star(cx: number, cy: number, outer: number, inner: number, points: number, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const Twinkle = ({ x, y, r = 4, fill = C.gold }: { x: number; y: number; r?: number; fill?: string }) => (
  <path d={star(x, y, r, r * 0.35, 4, 0)} fill={fill} />
);

interface Vignette {
  tint: string;
  draw: () => ReactNode;
}

const VIGNETTES: Record<string, Vignette> = {
  handshake: {
    tint: C.tech,
    draw: () => (
      <>
        <Shadow cy={92} rx={40} />
        <rect x={-6} y={56} width={48} height={22} rx={9} fill={C.tech} />
        <rect x={36} y={56} width={7} height={22} rx={3} fill={C.techDk} />
        <rect x={78} y={50} width={48} height={22} rx={9} fill={C.coral} />
        <rect x={77} y={50} width={7} height={22} rx={3} fill={C.coralDk} />
        <path d="M79 53Q66 50 57 57Q53 61 58 63L66 61Q70 67 79 69Z" fill={C.skinB} />
        <path d="M42 58Q56 51 66 57L73 63Q75 67 71 68L58 67Q48 73 42 72Z" fill={C.skinA} />
        <path d="M55 61l9 2M54 65l9 1.5" stroke="#C99572" strokeWidth={1.6} strokeLinecap="round" />
        <Twinkle x={48} y={30} r={5} />
        <Twinkle x={70} y={22} r={6} />
        <Twinkle x={62} y={40} r={3.5} fill={C.coral} />
      </>
    ),
  },
  press: {
    tint: C.gold,
    draw: () => (
      <>
        <path d={star(60, 46, 40, 24, 12)} fill={C.gold} opacity={0.45} />
        <Shadow cy={96} rx={32} />
        <rect x={38} y={66} width={44} height={28} rx={4} fill={C.woodDk} />
        <rect x={34} y={60} width={52} height={10} rx={4} fill={C.wood} />
        <path d="M48 50L52 60M60 46V60M72 50L68 60" stroke={C.ink} strokeWidth={3} strokeLinecap="round" />
        <rect x={42} y={50} width={9} height={6} rx={1.5} fill={C.coral} transform="rotate(-20 46 53)" />
        <rect x={55.5} y={49} width={9} height={6} rx={1.5} fill={C.tech} />
        <rect x={69} y={50} width={9} height={6} rx={1.5} fill={C.audio} transform="rotate(20 73 53)" />
        <circle cx={46} cy={44} r={6.5} fill={C.ink} />
        <circle cx={60} cy={39} r={6.5} fill={C.ink} />
        <circle cx={74} cy={44} r={6.5} fill={C.ink} />
        <circle cx={58} cy={37} r={2} fill="#FFFFFF" opacity={0.35} />
        <Twinkle x={24} y={26} r={6} fill="#FFFFFF" />
        <Twinkle x={96} y={30} r={5} fill="#FFFFFF" />
      </>
    ),
  },
  conflict: {
    tint: C.red,
    draw: () => (
      <>
        <Shadow cy={96} rx={36} />
        <path d="M14 24H52Q60 24 60 32V52Q60 60 52 60H30L20 70V60H14Q6 60 6 52V32Q6 24 14 24Z" fill={C.tech} />
        <path d="M68 40H106Q114 40 114 48V68Q114 76 106 76H100V86L90 76H68Q60 76 60 68V48Q60 40 68 40Z" fill={C.coral} />
        <path d="M18 42l6-6 6 6 6-6 6 6 6-6" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M87 48V62M87 68v.1" stroke="#FFFFFF" strokeWidth={4.5} strokeLinecap="round" />
        <path d="M66 14L53 46H63L55 76L77 38H66L72 14Z" fill={C.gold} stroke="#FFF7DF" strokeWidth={2} strokeLinejoin="round" />
      </>
    ),
  },
  mountain: {
    tint: C.green,
    draw: () => (
      <>
        <circle cx={92} cy={30} r={10} fill={C.gold} />
        <path d="M14 34h14M18 30h8" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
        <path d="M44 96L78 46L114 96Z" fill="#7FB3A8" />
        <path d="M78 46L114 96H90Z" fill="#5E968B" />
        <path d="M6 96L50 28L94 96Z" fill="#7C9A6E" />
        <path d="M50 28L94 96H62Z" fill="#5F7D55" />
        <path d="M50 28L39.5 44L45 41L50 46L55 41L60.5 44Z" fill={C.paper} />
        <path d="M50 28V13" stroke={C.ink} strokeWidth={2} strokeLinecap="round" />
        <path d="M50 13L63 17L50 21Z" fill={C.coral} />
      </>
    ),
  },
  pizza: {
    tint: C.coral,
    draw: () => (
      <>
        <Shadow cy={96} rx={44} />
        <path d="M22 60V30Q22 26 26 26H94Q98 26 98 30V60Z" fill="#D9B98F" />
        <path d="M30 34H90" stroke="#C4A274" strokeWidth={2} strokeLinecap="round" />
        <path d="M14 72L22 60H98L106 72Z" fill="#E7CDA4" />
        <path d="M14 72H106L99 92H21Z" fill="#CFA877" />
        <ellipse cx={60} cy={67} rx={34} ry={9} fill="#E5A148" />
        <ellipse cx={60} cy={66.5} rx={30} ry={7.4} fill="#E5683F" />
        <ellipse cx={60} cy={66} rx={26} ry={5.8} fill="#F6CB62" />
        {(
          [
            [46, 65],
            [60, 63],
            [72, 67],
            [55, 69],
            [67, 63.5],
          ] as const
        ).map(([x, y]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={3.4} ry={1.4} fill="#B8402E" />
        ))}
        <path d="M60 60V72M36 66H84" stroke="#E5A148" strokeWidth={1.2} opacity={0.8} />
        <path d="M44 20C41 16 47 13 44 9M60 18C57 14 63 11 60 7M76 20C73 16 79 13 76 9" stroke="#FFFFFF" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.8} />
      </>
    ),
  },
  megaphone: {
    tint: C.coral,
    draw: () => (
      <>
        <Shadow cy={98} rx={36} />
        <path d="M40 66L45 88H54L50 64Z" fill={C.ink} />
        <rect x={16} y={50} width={16} height={20} rx={5} fill={C.ink} />
        <path d="M30 50L80 28V92L30 70Z" fill={C.coral} />
        <path d="M30 60L80 50V92L30 70Z" fill={C.coralDk} opacity={0.5} />
        <ellipse cx={80} cy={60} rx={8} ry={32} fill={C.coralDk} />
        <ellipse cx={81} cy={60} rx={4.5} ry={25} fill={C.ink} opacity={0.35} />
        <path d="M94 44Q102 60 94 76M103 34Q116 60 103 86" stroke={C.gold} strokeWidth={4} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  contract: {
    tint: C.tech,
    draw: () => (
      <>
        <Shadow cy={98} rx={34} />
        <path d="M32 14H76L90 28V92Q90 96 86 96H32Q28 96 28 92V18Q28 14 32 14Z" fill={C.paper} />
        <path d="M76 14V28H90" fill={C.paperDk} />
        <path d="M38 30H64M38 40H80M38 48H80M38 56H72" stroke={C.paperDk} strokeWidth={3} strokeLinecap="round" />
        <path d="M54 80H82" stroke={C.grey} strokeWidth={1.5} strokeLinecap="round" />
        <path d="M56 76C59 68 62 68 63 75S67 81 70 72C72 77 75 78 80 75" stroke={C.tech} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <circle cx={42} cy={78} r={8} fill={C.red} />
        <path d={star(42, 78.5, 5, 2.2, 5)} fill="#FFE3E7" />
        <g transform="rotate(-38 92 78)">
          <rect x={74} y={74} width={34} height={8} rx={4} fill={C.ink} />
          <rect x={98} y={74} width={6} height={8} fill={C.gold} />
          <path d="M74 74L64 78L74 82Z" fill={C.gold} />
        </g>
      </>
    ),
  },
  crowd: {
    tint: C.art,
    draw: () => {
      const back: [number, string, string][] = [
        [22, C.skinB, C.audio],
        [46, C.skinA, C.gold],
        [72, C.skinC, C.tech],
        [98, C.skinA, C.coral],
      ];
      const front: [number, string, string][] = [
        [34, C.skinA, C.art],
        [60, C.skinB, C.coral],
        [86, C.skinC, C.green],
      ];
      return (
        <>
          {[
            [20, 18, C.gold],
            [44, 12, C.coral],
            [80, 16, C.tech],
            [100, 24, C.audio],
            [62, 22, C.gold],
          ].map(([x, y, c], i) => (
            <rect key={i} x={x as number} y={y as number} width={5} height={8} rx={1.2} fill={c as string} transform={`rotate(${i * 37} ${x} ${y})`} />
          ))}
          {back.map(([x, skin, top], i) => (
            <g key={`b${i}`}>
              <path d={`M${x - 2} 62L${x - 12} 36`} stroke={skin} strokeWidth={5} strokeLinecap="round" />
              <rect x={x - 12} y={60} width={24} height={40} rx={10} fill={top} />
              <circle cx={x} cy={52} r={9} fill={skin} />
            </g>
          ))}
          {front.map(([x, skin, top], i) => (
            <g key={`f${i}`}>
              {i === 1 ? <path d={`M${x + 6} 78L${x + 16} 52`} stroke={skin} strokeWidth={5.5} strokeLinecap="round" /> : null}
              <rect x={x - 14} y={78} width={28} height={44} rx={12} fill={top} />
              <circle cx={x} cy={68} r={10.5} fill={skin} />
              <circle cx={x - 3.5} cy={68} r={1.4} fill={C.ink} />
              <circle cx={x + 3.5} cy={68} r={1.4} fill={C.ink} />
              <path d={`M${x - 3.5} 72Q${x} 75.5 ${x + 3.5} 72`} stroke={C.ink} strokeWidth={1.4} fill="none" strokeLinecap="round" />
            </g>
          ))}
        </>
      );
    },
  },
  smoke: {
    tint: C.grey,
    draw: () => (
      <>
        <Shadow cy={96} rx={34} />
        <rect x={34} y={56} width={52} height={38} rx={6} fill={C.metalDk} />
        <rect x={34} y={50} width={52} height={10} rx={5} fill={C.metal} />
        <path d="M42 66H62M42 74H62M42 82H62" stroke={C.ink} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
        <circle cx={74} cy={68} r={2.4} fill={C.red} />
        <circle cx={74} cy={78} r={2.4} fill={C.gold} />
        <path d="M76 50Q70 40 77 32Q78 40 84 42Q88 48 82 50Z" fill={C.coral} />
        <path d="M78 50Q76 45 79 41Q80 45 82 46Q83 49 81 50Z" fill={C.gold} />
        <g fill="#7D756C" opacity={0.75}>
          <circle cx={52} cy={38} r={10} />
          <circle cx={64} cy={30} r={12} />
          <circle cx={46} cy={26} r={8} />
          <circle cx={80} cy={22} r={9} />
          <circle cx={60} cy={16} r={8} />
        </g>
        <g fill="#B1A99E" opacity={0.6}>
          <circle cx={49} cy={35} r={5} />
          <circle cx={61} cy={26} r={6} />
          <circle cx={78} cy={19} r={4.5} />
        </g>
      </>
    ),
  },
  audit: {
    tint: C.tech,
    draw: () => (
      <>
        <Shadow cy={98} rx={34} />
        <rect x={22} y={18} width={54} height={78} rx={6} fill={C.wood} />
        <rect x={28} y={27} width={42} height={63} rx={3} fill={C.paper} />
        <rect x={38} y={13} width={22} height={11} rx={3} fill={C.metal} />
        {[38, 52, 66].map((y, i) => (
          <g key={y}>
            {i === 2 ? (
              <path d={`M33 ${y - 3}l6 6M39 ${y - 3}l-6 6`} stroke={C.red} strokeWidth={2.4} strokeLinecap="round" />
            ) : (
              <path d={`M32 ${y}l3 3 5-6`} stroke={C.green} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <path d={`M45 ${y}H64`} stroke={C.paperDk} strokeWidth={3} strokeLinecap="round" />
          </g>
        ))}
        <path d="M91 82L102 93" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
        <circle cx={80} cy={70} r={16} fill={C.tech} fillOpacity={0.22} stroke={C.ink} strokeWidth={5} />
        <path d="M71 66A10 10 0 0 1 78 59" stroke="#FFFFFF" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  student: {
    tint: C.art,
    draw: () => (
      <>
        <Shadow cy={98} rx={40} />
        <rect x={22} y={82} width={74} height={13} rx={3} fill={C.tech} />
        <path d="M26 86H92" stroke={C.paper} strokeWidth={2} />
        <rect x={30} y={70} width={62} height={13} rx={3} fill={C.coral} />
        <path d="M34 74H88" stroke={C.paper} strokeWidth={2} />
        <rect x={26} y={58} width={66} height={13} rx={3} fill={C.audio} />
        <path d="M30 62H88" stroke={C.paper} strokeWidth={2} />
        <path d="M43 42V52Q60 60 77 52V42L60 48Z" fill="#433B33" />
        <path d="M60 22L96 35L60 48L24 35Z" fill={C.ink} />
        <path d="M60 35L92 36V54" stroke={C.gold} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <circle cx={60} cy={35} r={2.6} fill={C.gold} />
        <path d="M89 54H95L94 62H90Z" fill={C.gold} />
      </>
    ),
  },
  letters: {
    tint: C.coral,
    draw: () => {
      const env = (x: number, y: number, rot: number, key: string, flap: string) => (
        <g key={key} transform={`rotate(${rot} ${x + 26} ${y + 17})`}>
          <rect x={x} y={y} width={52} height={34} rx={4} fill={C.paper} />
          <path d={`M${x + 2} ${y + 2}L${x + 26} ${y + 19}L${x + 50} ${y + 2}`} stroke={flap} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <rect x={x + 40} y={y + 22} width={8} height={8} rx={1.5} fill={flap} opacity={0.8} />
        </g>
      );
      return (
        <>
          <Shadow cy={96} rx={40} />
          {env(14, 54, -10, 'a', C.tech)}
          {env(52, 56, 9, 'b', C.audio)}
          {env(32, 38, -3, 'c', C.coral)}
          <path d="M58 64S50 59 50 54.5A4.2 4.2 0 0 1 58 52.5A4.2 4.2 0 0 1 66 54.5C66 59 58 64 58 64Z" fill={C.red} />
          <path d="M84 24S78 20 78 16.5A3.3 3.3 0 0 1 84 15A3.3 3.3 0 0 1 90 16.5C90 20 84 24 84 24Z" fill={C.red} opacity={0.7} />
          <path d="M26 24S21 20.5 21 17.5A2.8 2.8 0 0 1 26 16.2A2.8 2.8 0 0 1 31 17.5C31 20.5 26 24 26 24Z" fill={C.coral} opacity={0.7} />
        </>
      );
    },
  },
  briefcase: {
    tint: C.gold,
    draw: () => (
      <>
        <Shadow cy={96} rx={42} />
        <path d="M46 46V36Q46 31 51 31H69Q74 31 74 36V46" stroke="#5E3D27" strokeWidth={5} fill="none" />
        <rect x={20} y={44} width={80} height={48} rx={8} fill="#8A5A3B" />
        <rect x={20} y={44} width={80} height={20} rx={8} fill="#A06B47" />
        <path d="M20 62H100" stroke="#5E3D27" strokeWidth={2} />
        <rect x={34} y={58} width={9} height={9} rx={2} fill={C.gold} />
        <rect x={77} y={58} width={9} height={9} rx={2} fill={C.gold} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <ellipse cx={104} cy={90 - i * 5} rx={9} ry={3.2} fill={C.goldDk} />
            <ellipse cx={104} cy={88.5 - i * 5} rx={9} ry={3.2} fill={C.gold} />
          </g>
        ))}
        <Twinkle x={30} y={28} r={5} />
      </>
    ),
  },
  shark: {
    tint: C.tech,
    draw: () => (
      <>
        <rect x={0} y={66} width={120} height={60} fill={C.tech} opacity={0.35} />
        <path d="M38 70C50 62 56 40 76 28C71 44 73 57 82 70Z" fill="#5B6B7F" />
        <path d="M76 28C71 44 73 57 82 70H74C68 56 68 42 76 28Z" fill="#46535F" />
        <path d="M0 68Q10 62 20 68T40 68T60 68T80 68T100 68T120 68" stroke={C.paper} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M10 86Q20 81 30 86M74 90Q84 85 94 90" stroke={C.paper} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.6} />
        <circle cx={24} cy={56} r={9} fill={C.gold} stroke={C.goldDk} strokeWidth={2} />
        <path d="M24 51V61" stroke={C.goldDk} strokeWidth={2.2} strokeLinecap="round" />
      </>
    ),
  },
  lightbulb: {
    tint: C.gold,
    draw: () => (
      <>
        <Shadow cy={98} rx={20} />
        <g stroke={C.gold} strokeWidth={3.5} strokeLinecap="round">
          <path d="M60 10V16M30 22L34.5 26.5M90 22L85.5 26.5M20 48H26M94 48H100M28 74L33 70M92 74L87 70" />
        </g>
        <circle cx={60} cy={48} r={24} fill="#FFE7A3" />
        <circle cx={60} cy={48} r={24} fill="none" stroke={C.gold} strokeWidth={2} />
        <path d="M50 66H70V74H50Z" fill="#FFE7A3" />
        <path d="M51 53Q55.5 43 60 53Q64.5 43 69 53" stroke={C.coral} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M54 54V66M66 54V66" stroke={C.coral} strokeWidth={1.6} opacity={0.6} />
        <rect x={48} y={73} width={24} height={16} rx={4} fill={C.metal} />
        <path d="M48 78H72M48 84H72" stroke={C.metalDk} strokeWidth={2} />
        <path d="M54 89H66L63 94H57Z" fill={C.metalDk} />
        <path d="M46 38A16 16 0 0 1 54 30" stroke="#FFFFFF" strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.8} />
      </>
    ),
  },
  heart: {
    tint: C.red,
    draw: () => (
      <>
        <Shadow cy={98} rx={28} />
        <path d="M60 92S22 70 22 44A19 19 0 0 1 60 34A19 19 0 0 1 98 44C98 70 60 92 60 92Z" fill={C.red} />
        <path d="M60 92S22 70 22 44A19 19 0 0 1 41 26C34 40 40 70 60 92Z" fill="#FFFFFF" opacity={0.12} />
        <path d="M34 42A10 10 0 0 1 44 32" stroke="#FFFFFF" strokeWidth={4.5} fill="none" strokeLinecap="round" opacity={0.6} />
        <path d="M98 22S92 18 92 14.5A3.3 3.3 0 0 1 98 13A3.3 3.3 0 0 1 104 14.5C104 18 98 22 98 22Z" fill={C.coral} />
        <Twinkle x={18} y={22} r={5} />
        <Twinkle x={104} y={60} r={4} />
      </>
    ),
  },
  calendar: {
    tint: C.tech,
    draw: () => (
      <>
        <Shadow cy={98} rx={38} />
        <rect x={22} y={24} width={76} height={70} rx={9} fill={C.paper} />
        <path d="M22 33Q22 24 31 24H89Q98 24 98 33V42H22Z" fill={C.coral} />
        <rect x={38} y={16} width={7} height={16} rx={3.5} fill={C.ink} />
        <rect x={75} y={16} width={7} height={16} rx={3.5} fill={C.ink} />
        {[0, 1, 2, 3].flatMap((row) =>
          [0, 1, 2, 3, 4].map((col) => (
            <rect key={`${row}-${col}`} x={30 + col * 13} y={50 + row * 10} width={8} height={6} rx={1.5} fill={C.paperDk} />
          )),
        )}
        <circle cx={73} cy={73} r={8.5} fill="none" stroke={C.red} strokeWidth={3} />
      </>
    ),
  },
  house: {
    tint: C.green,
    draw: () => (
      <>
        <ellipse cx={60} cy={94} rx={52} ry={9} fill={C.green} opacity={0.6} />
        <rect x={68} y={26} width={9} height={18} rx={2} fill={C.woodDk} />
        <rect x={32} y={54} width={50} height={38} fill={C.paper} />
        <rect x={32} y={54} width={50} height={6} fill={C.paperDk} />
        <path d="M24 58L57 28L90 58Z" fill={C.coral} strokeLinejoin="round" />
        <path d="M57 28L90 58H80Z" fill={C.coralDk} />
        <rect x={50} y={70} width={14} height={22} rx={2} fill={C.wood} />
        <circle cx={61} cy={81} r={1.4} fill={C.gold} />
        <rect x={37} y={66} width={9} height={9} rx={1.5} fill={C.tech} />
        <rect x={68} y={66} width={9} height={9} rx={1.5} fill={C.tech} />
        <rect x={98} y={70} width={5} height={22} rx={2} fill={C.woodDk} />
        <circle cx={100.5} cy={64} r={12} fill={C.greenDk} />
        <circle cx={97} cy={60} r={6} fill={C.green} opacity={0.8} />
      </>
    ),
  },
  robot: {
    tint: C.audio,
    draw: () => (
      <>
        <Shadow cy={98} rx={28} />
        <path d="M60 22V12" stroke={C.ink} strokeWidth={3} />
        <circle cx={60} cy={10} r={4} fill={C.coral} />
        <path d="M34 70L20 56M86 70L100 54" stroke={C.metalDk} strokeWidth={6} strokeLinecap="round" />
        <circle cx={19} cy={54} r={5} fill={C.metal} />
        <circle cx={101} cy={52} r={5} fill={C.metal} />
        <rect x={36} y={62} width={48} height={32} rx={9} fill={C.metalDk} />
        <rect x={50} y={70} width={20} height={12} rx={3} fill={C.audio} />
        <rect x={30} y={22} width={60} height={42} rx={13} fill={C.metal} />
        <rect x={30} y={22} width={60} height={10} rx={5} fill="#B7C0CC" />
        <circle cx={47} cy={42} r={7} fill={C.ink} />
        <circle cx={73} cy={42} r={7} fill={C.ink} />
        <circle cx={48.5} cy={40.5} r={2.6} fill={C.audio} />
        <circle cx={74.5} cy={40.5} r={2.6} fill={C.audio} />
        <path d="M52 54Q60 59 68 54" stroke={C.ink} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  trophy: {
    tint: C.gold,
    draw: () => (
      <>
        <Shadow cy={98} rx={44} />
        <rect x={18} y={76} width={28} height={18} rx={3} fill={C.art} />
        <rect x={46} y={66} width={28} height={28} rx={3} fill={C.tech} />
        <rect x={74} y={82} width={28} height={12} rx={3} fill={C.audio} />
        <path d="M60 72V80M54 74H66" stroke="#FFFFFF" strokeWidth={2} opacity={0.5} strokeLinecap="round" />
        <path d="M48 26H40C40 36 45 40 50 41M72 26H80C80 36 75 40 70 41" stroke={C.goldDk} strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d="M47 20H73V36C73 46 67 52 60 52C53 52 47 46 47 36Z" fill={C.gold} />
        <rect x={56} y={51} width={8} height={8} fill={C.goldDk} />
        <rect x={50} y={58} width={20} height={8} rx={2} fill={C.goldDk} />
        <path d="M52 24V34" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" opacity={0.5} />
        {[
          [22, 30, C.coral],
          [94, 26, C.tech],
          [30, 52, C.audio],
          [92, 52, C.art],
          [104, 40, C.gold],
        ].map(([x, y, c], i) => (
          <rect key={i} x={x as number} y={y as number} width={5} height={8} rx={1.2} fill={c as string} transform={`rotate(${i * 41 - 30} ${x} ${y})`} />
        ))}
      </>
    ),
  },
  leak: {
    tint: C.audio,
    draw: () => (
      <>
        <Shadow cy={98} rx={38} />
        <g transform="rotate(-14 84 34)">
          <rect x={70} y={18} width={28} height={34} rx={3} fill={C.paper} />
          <path d="M75 26H92M75 32H92M75 38H86" stroke={C.paperDk} strokeWidth={2.4} strokeLinecap="round" />
        </g>
        <g transform="rotate(12 62 28)">
          <rect x={50} y={12} width={26} height={32} rx={3} fill={C.paper} />
          <path d="M55 20H70M55 26H70M55 32H64" stroke={C.paperDk} strokeWidth={2.4} strokeLinecap="round" />
        </g>
        <path d="M18 50H44L50 56H98Q102 56 102 60V90Q102 94 98 94H22Q18 94 18 90Z" fill="#E2B865" />
        <path d="M18 62H102V90Q102 94 98 94H22Q18 94 18 90Z" fill="#D4A54E" />
        <rect x={28} y={36} width={26} height={30} rx={3} fill={C.paper} transform="rotate(-6 41 51)" />
        <path d="M26 68H94" stroke="#B88A3A" strokeWidth={2} opacity={0.5} />
        <circle cx={60} cy={77} r={7} fill="none" stroke={C.red} strokeWidth={3} />
        <path d="M60 73.5V77.5M60 80.5v.1" stroke={C.red} strokeWidth={2.6} strokeLinecap="round" />
        <path d="M100 18L106 12M104 26H112M94 12L96 4" stroke={C.coral} strokeWidth={2.6} strokeLinecap="round" />
      </>
    ),
  },
};

const FALLBACK: Vignette = {
  tint: C.art,
  draw: () => (
    <>
      <Shadow cy={96} rx={26} />
      <path d={star(60, 54, 32, 10, 4, 0)} fill={C.gold} />
      <path d={star(60, 54, 14, 5, 4, 45)} fill="#FFF7DF" opacity={0.8} />
      <circle cx={26} cy={28} r={4} fill={C.coral} />
      <circle cx={96} cy={34} r={3} fill={C.tech} />
      <circle cx={92} cy={86} r={3.5} fill={C.audio} />
    </>
  ),
};

export function EventArt({ art, size = 120, className, label }: { art: string; size?: number; className?: string; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const v = VIGNETTES[art] ?? FALLBACK;
  const clip = `ev-c-${uid}`;
  const glow = `ev-g-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <rect width={120} height={120} rx={24} />
        </clipPath>
        <radialGradient id={glow} cx="0.35" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={120} height={120} fill={v.tint} opacity={0.2} />
        <rect width={120} height={120} fill={`url(#${glow})`} />
        {v.draw()}
      </g>
      <rect x={0.75} y={0.75} width={118.5} height={118.5} rx={23.5} fill="none" stroke={v.tint} strokeOpacity={0.35} strokeWidth={1.5} />
    </svg>
  );
}

// ── Studio brand (original) ─────────────────────────────────────

/** Original mark for "Arnav Game Studio Empire": a garage studio under a crown, with a controller up front. */
export function GameLogo({ size = 40, className, title }: { size?: number; className?: string; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bg = `lg-b-${uid}`;
  const gold = `lg-g-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#EB8A6D" />
          <stop offset="1" stopColor="#C24E36" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6D06A" />
          <stop offset="1" stopColor="#D9A12A" />
        </linearGradient>
      </defs>
      <ellipse cx={32} cy={61} rx={22} ry={2.4} fill="#000000" opacity={0.18} />
      <rect x={3} y={11} width={58} height={49} rx={14} fill={`url(#${bg})`} />
      <rect x={3} y={11} width={58} height={22} rx={14} fill="#FFFFFF" opacity={0.1} />
      {/* garage */}
      <path d="M13 54V33.5L32 23L51 33.5V54Z" fill="#FFF4E6" strokeLinejoin="round" />
      <rect x={18} y={36} width={28} height={18} rx={2.5} fill="#F1D8C2" />
      <path d="M18 40.5H46M18 45H46M18 49.5H46" stroke="#D8A88D" strokeWidth={1.4} />
      {/* controller */}
      <path
        d="M24 45.5H40A5.5 5.5 0 0 1 45.4 50L46 53.4A2.6 2.6 0 0 1 41.4 55.3L39.6 53.2H24.4L22.6 55.3A2.6 2.6 0 0 1 18 53.4L18.6 50A5.5 5.5 0 0 1 24 45.5Z"
        fill="#2A2622"
      />
      <path d="M23.5 48.2V51.4M21.9 49.8H25.1" stroke="#FFF4E6" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={38.6} cy={48.8} r={1.1} fill="#E3B23C" />
      <circle cx={40.8} cy={51} r={1.1} fill="#E07A5F" />
      {/* crown */}
      <path d="M21 20.5L19 7.5L26.5 13L32 4L37.5 13L45 7.5L43 20.5Z" fill={`url(#${gold})`} stroke="#B98A1F" strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={20.5} y={18.5} width={23} height={4.5} rx={1.6} fill="#C9921F" />
      <circle cx={32} cy={4} r={1.8} fill="#FFF4C8" />
      <circle cx={19} cy={7.5} r={1.5} fill="#FFF4C8" />
      <circle cx={45} cy={7.5} r={1.5} fill="#FFF4C8" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`} aria-label="Arnav Game Studio Empire" role="img">
      <GameLogo size={40} />
      <span className="flex flex-col leading-none" aria-hidden="true">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink3">Arnav Game</span>
        <span className="font-display text-xl font-bold text-ink">
          Studio <span className="text-accent">Empire</span>
        </span>
      </span>
    </span>
  );
}
