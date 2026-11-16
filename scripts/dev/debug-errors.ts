import { runBot } from '../../tests/bots/run';
const r = runBot((process.argv[2] ?? 'trend') as never, Number(process.argv[3] ?? 8919), Number(process.argv[4] ?? 46));
console.log(r.errors.slice(0, 6).join('\n'));
