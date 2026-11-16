import { fromDay } from '../../src/sim/calendar';
import type { GameState } from '../../src/sim/types';

/** Deep scan for NaN / Infinity. Returns the paths of offending values. */
export function findNonFinite(obj: unknown, path = '$', out: string[] = []): string[] {
  if (out.length > 10) return out;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      // Infinity is allowed only in derived caches, which are never in state.
      out.push(`${path}=${obj}`);
    }
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findNonFinite(v, `${path}[${i}]`, out));
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findNonFinite(v, `${path}.${k}`, out);
  }
  return out;
}

export function checkInvariants(s: GameState): string[] {
  const errs: string[] = [];
  const nf = findNonFinite(s);
  if (nf.length) errs.push(`non-finite values: ${nf.join(', ')}`);
  for (const st of Object.values(s.staff)) {
    for (const k of ['morale', 'energy', 'burnout', 'loyalty'] as const)
      if (st[k] < 0 || st[k] > 100) errs.push(`${st.name}.${k}=${st[k]}`);
    for (const [k, v] of Object.entries(st.skills)) if (v < 0 || v > 100) errs.push(`${st.name}.skill.${k}=${v}`);
    if (st.salary < 0) errs.push(`${st.name}.salary<0`);
  }
  for (const hw of s.hardware) {
    if (hw.installedM < 0 || hw.unitsSold < 0) errs.push(`console ${hw.name} negative sales`);
    if (hw.rdPaid > hw.rdTotal + 1) errs.push(`console ${hw.name} overpaid R&D`);
    if (hw.feeRate < 0 || hw.feeRate > 0.5) errs.push(`console ${hw.name} feeRate=${hw.feeRate}`);
    if (hw.price <= 0) errs.push(`console ${hw.name} price=${hw.price}`);
  }
  if (s.subscription && (s.subscription.subscribers < 0 || s.subscription.price <= 0)) errs.push(`subscription out of range`);
  if (s.hardware.filter((h) => h.status === 'live').length > 2) errs.push('more than 2 live consoles');
  if (s.hardware.filter((h) => h.status === 'dev').length > 1) errs.push('more than 1 console in development');
  for (const r of Object.values(s.releases)) {
    if (r.units < 0 || !Number.isInteger(r.units)) errs.push(`release ${r.name} units=${r.units}`);
    for (const p of r.platforms) {
      if (p.units < 0 || !Number.isInteger(p.units)) errs.push(`release ${r.name} ${p.platform} units=${p.units}`);
      if (p.units > Math.max(1, p.potential) * 1.5 + 50) errs.push(`release ${r.name} ${p.platform} units ${p.units} > potential ${p.potential}`);
    }
    if (r.score < 1 || r.score > 100 || r.userScore < 1 || r.userScore > 100) errs.push(`release ${r.name} score out of range`);
  }
  for (const p of Object.values(s.projects)) if (p.kind === 'game' && (p.bugs < 0 || p.design < 0 || p.tech < 0)) errs.push(`project ${p.id} negative`);
  const shareSum = Object.values(s.market.share).reduce((a, b) => a + b, 0);
  if (Object.keys(s.market.share).length && Math.abs(shareSum - 1) > 1e-6) errs.push(`market shares sum to ${shareSum}`);
  if (s.company.reputation < 0 || s.company.reputation > 100) errs.push(`reputation ${s.company.reputation}`);
  // Runaway money: era-scaled ceiling
  const yr = fromDay(s.day).year;
  const ceiling = yr < 1990 ? 2e8 : yr < 2000 ? 3e9 : yr < 2010 ? 3e10 : 2e11;
  if (s.company.cash > ceiling) errs.push(`runaway cash ${s.company.cash} in ${yr}`);
  if (s.finance.loans.some((l) => l.remaining < 0 || !Number.isFinite(l.monthly))) errs.push('bad loan');
  const alive = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer).length;
  if (alive < 5) errs.push(`only ${alive} rivals alive`);
  return errs;
}
