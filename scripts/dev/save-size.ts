import { runBot } from '../../tests/bots/run';
import { gzipSync } from 'node:zlib';
const r = runBot('tycoon', 8919, 46);
const json = JSON.stringify(r.state);
const gz = gzipSync(json).length;
const parts = Object.entries(r.state as unknown as Record<string, unknown>).map(([k, v]) => [k, JSON.stringify(v).length] as const).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('json', (json.length / 1e6).toFixed(2), 'MB · gzip', (gz / 1e6).toFixed(2), 'MB · base64', ((gz * 4) / 3 / 1e6).toFixed(2), 'MB');
console.log(parts.map(([k, v]) => `${k}:${(v / 1e3).toFixed(0)}k`).join(' '));
