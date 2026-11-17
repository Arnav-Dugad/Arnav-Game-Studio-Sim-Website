/**
 * Finance: monthly payroll/rent/upkeep, loans & credit, taxes, insolvency → bankruptcy,
 * company valuation, IPO and the stock price.
 */
import { BRANCH } from '../../data/regions';
import { BALANCE } from '../../data/balance';
import { ITEM_BY_ID } from '../../data/facilities';
import { clamp } from '../breakdown';
import { fromDay, interp, yearFrac } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Loan, MonthLedger } from '../types';
import { earn, fmtMoney, inflation, money, newId, pushNews, spend, sum } from '../util';
import { tierDef } from './office';
import { payrollMonthly } from './staff';

export function loanRate(s: GameState): number {
  const base = interp(BALANCE.LOAN_RATE_BY_YEAR, yearFrac(s.day));
  const risk = clamp((700 - s.company.creditScore) / 1000, -0.02, 0.12);
  return Math.max(0.02, base + risk);
}

export function trailingRevenue(s: GameState): number {
  return sum(s.finance.revenue12m);
}

export function creditLimit(s: GameState): number {
  const debt = sum(s.finance.loans.map((l) => l.remaining));
  const base = BALANCE.CREDIT_BASE * inflation(s.day) + Math.max(trailingRevenue(s) * BALANCE.CREDIT_MULTIPLE, Math.max(0, valuation(s) - s.company.cash) * 0.12);
  const scoreMul = clamp((s.company.creditScore - 400) / 300, 0.3, 1.3);
  return Math.max(0, Math.round(base * scoreMul - debt));
}

export function takeLoan(s: GameState, amount: number, months: number): Loan | null {
  const limit = creditLimit(s);
  if (amount <= 0 || amount > limit) return null;
  const rate = loanRate(s);
  const r = rate / 12;
  const monthly = r > 0 ? (amount * r) / (1 - Math.pow(1 + r, -months)) : amount / months;
  const loan: Loan = { id: newId(s, 'l'), principal: amount, remaining: amount, rate, monthly, monthsLeft: months, takenDay: s.day };
  s.finance.loans.push(loan);
  earn(s, 'other_income', amount);
  // borrowed money is not revenue: move it out of income categories
  const l = s.finance.ledger[s.finance.ledger.length - 1];
  if (l) {
    l.income.other_income = (l.income.other_income ?? 0) - Math.round(amount);
    if (l.income.other_income === 0) delete l.income.other_income;
  }
  return loan;
}

export function repayLoan(s: GameState, id: string): boolean {
  const loan = s.finance.loans.find((l) => l.id === id);
  if (!loan || s.company.cash < loan.remaining) return false;
  s.company.cash -= Math.round(loan.remaining);
  s.finance.loans = s.finance.loans.filter((l) => l.id !== id);
  s.company.creditScore = clamp(s.company.creditScore + 10, 300, 850);
  return true;
}

export function monthlyUpkeep(s: GameState): number {
  let up = 0;
  for (const it of s.office.items) up += ITEM_BY_ID[it.item].upkeep;
  return up * inflation(s.day);
}

export function monthlyRent(s: GameState): number {
  return (tierDef(s.office.tier).rent + (s.company.branches?.length ?? 0) * BRANCH.rent) * inflation(s.day);
}

/** Wellness program cost per person per month (1980 dollars). */
export const WELLNESS_COST = 40;

export function monthlyBurn(s: GameState): number {
  return payrollMonthly(s) + monthlyRent(s) + monthlyUpkeep(s) + sum(s.finance.loans.map((l) => l.monthly)) + (s.company.policies.wellness ? WELLNESS_COST * inflation(s.day) * Object.keys(s.staff).length : 0);
}

/** First day of each month: pay bills, roll the ledger, check solvency. */
export function financeMonthly(c: Ctx): void {
  const { s } = c;
  // Close the previous month
  const prev = s.finance.ledger[s.finance.ledger.length - 1];
  if (prev) {
    prev.cashEnd = s.company.cash;
    const rev = sum(Object.values(prev.income).map((v) => v ?? 0));
    s.finance.revenue12m.push(rev);
    if (s.finance.revenue12m.length > 12) s.finance.revenue12m.shift();
    const exp = sum(Object.values(prev.expense).map((v) => v ?? 0));
    s.finance.profitYTD += rev - (exp - (prev.expense.taxes ?? 0));
  }
  const ledger: MonthLedger = { day: s.day, income: {}, expense: {}, cashEnd: s.company.cash };
  s.finance.ledger.push(ledger);
  if (s.finance.ledger.length > 600) s.finance.ledger.shift();

  // Bills
  spend(s, 'salaries', payrollMonthly(s));
  spend(s, 'rent', monthlyRent(s));
  spend(s, 'upkeep', monthlyUpkeep(s));
  if (s.company.policies.wellness) spend(s, 'other_expense', WELLNESS_COST * inflation(s.day) * Object.keys(s.staff).length);
  if (s.company.recruiting > 0) spend(s, 'recruiting', s.company.recruiting * 1_500 * inflation(s.day));
  if (s.company.policies.salaryPolicy === 'generous') spend(s, 'salaries', payrollMonthly(s) * 0.08);
  // Loans
  for (const loan of s.finance.loans) {
    const interest = loan.remaining * (loan.rate / 12);
    const principal = Math.min(loan.remaining, loan.monthly - interest);
    spend(s, 'loan_interest', interest);
    s.company.cash -= Math.round(principal);
    loan.remaining = Math.max(0, loan.remaining - principal);
    loan.monthsLeft -= 1;
  }
  const done = s.finance.loans.filter((l) => l.monthsLeft <= 0 || l.remaining <= 1);
  if (done.length) s.company.creditScore = clamp(s.company.creditScore + 12 * done.length, 300, 850);
  s.finance.loans = s.finance.loans.filter((l) => l.monthsLeft > 0 && l.remaining > 1);
  // Interest on cash
  if (s.company.cash > 0) earn(s, 'interest_income', s.company.cash * (interp(BALANCE.LOAN_RATE_BY_YEAR, yearFrac(s.day)) * 0.25) / 12);
  // Engine licensing income
  for (const e of Object.values(s.engines)) {
    if (e.licensees > 0 && !e.licensedFrom) earn(s, 'licensing', e.licensees * 2_500 * e.tech * inflation(s.day));
  }
  // Credit score drift
  if (s.company.cash < 0) s.company.creditScore = clamp(s.company.creditScore - 18, 300, 850);
  else s.company.creditScore = clamp(s.company.creditScore + 1.5, 300, 850);

  solvencyCheck(c);
}

export function solvencyCheck(c: Ctx): void {
  const { s } = c;
  const grace = BALANCE.BANKRUPTCY_GRACE_DAYS[s.settings.difficulty];
  if (s.company.cash < 0) {
    if (s.company.insolventSince === undefined) {
      s.company.insolventSince = s.day;
      c.out.push({ type: 'insolvent', graceDays: grace });
      pushNews(s, { category: 'studio', headline: `${s.company.name} is insolvent`, body: `You have ${grace} days to get cash positive: take a loan, cut costs, sell assets or land contract work.`, tone: 'bad' });
    } else if (s.day - s.company.insolventSince >= grace && creditLimit(s) < -s.company.cash) {
      s.status = 'bankrupt';
      s.endReason = `Bankrupt after ${Math.round((s.day - s.company.insolventSince) / 30)} months of insolvency.`;
      c.out.push({ type: 'gameOver', reason: s.endReason });
      pushNews(s, { category: 'studio', headline: `${s.company.name} files for bankruptcy`, tone: 'bad' });
    }
  } else if (s.company.insolventSince !== undefined) {
    s.progress.stats.daysInsolvent += s.day - s.company.insolventSince;
    s.progress.stats.recoveredFromInsolvency += 1;
    delete s.company.insolventSince;
    pushNews(s, { category: 'studio', headline: `${s.company.name} is solvent again`, tone: 'good' });
  }
}

export function yearlyTaxes(c: Ctx): void {
  const { s } = c;
  if (s.finance.profitYTD > 0) {
    const tax = s.finance.profitYTD * BALANCE.CORPORATE_TAX;
    spend(s, 'taxes', tax);
    s.finance.profitYTD = 0;
  } else {
    // losses carry forward (capped at three years' worth of payroll to stay sane)
    s.finance.profitYTD = Math.max(s.finance.profitYTD, -payrollMonthly(s) * 36);
  }
}

// ── Valuation & stock ───────────────────────────────────────────────────────

export function annualProfit(s: GameState): number {
  const months = s.finance.ledger.slice(-13, -1);
  let p = 0;
  for (const m of months) {
    p += sum(Object.values(m.income).map((v) => v ?? 0)) - sum(Object.values(m.expense).map((v) => v ?? 0));
  }
  return p;
}

export function ipValue(s: GameState): number {
  let v = 0;
  for (const f of Object.values(s.franchises)) v += f.fans * 4 * (f.bestScore / 100) * inflation(s.day);
  return v;
}

export function valuation(s: GameState): number {
  const profit = annualProfit(s);
  const rev = trailingRevenue(s);
  const debt = sum(s.finance.loans.map((l) => l.remaining));
  const growth = clamp(s.company.reputation / 50, 0.4, 2);
  const earningsValue = Math.max(0, profit) * BALANCE.PE_BASE * growth;
  const revenueValue = rev * 1.2;
  return Math.max(0, Math.max(earningsValue, revenueValue) + s.company.cash + ipValue(s) - debt);
}

/** What the founder's stake is worth: before going public, venture investors own part of the studio. */
export function ownerValue(s: GameState): number {
  return valuation(s) * (s.finance.stock ? 1 : 1 - (s.company.investorStake ?? 0));
}

export function ipoEligible(s: GameState): { ok: boolean; why: string } {
  if (s.finance.stock) return { ok: false, why: 'Already public' };
  const need = BALANCE.IPO_MIN_REVENUE * inflation(s.day);
  if (trailingRevenue(s) < need) return { ok: false, why: `Needs trailing revenue of ${Math.round(need / 1e6)}M+` };
  if (s.company.reputation < BALANCE.IPO_MIN_REPUTATION) return { ok: false, why: `Needs reputation ${BALANCE.IPO_MIN_REPUTATION}+` };
  return { ok: true, why: '' };
}

/** Venture funding rounds before going public. */
export const FUNDING_ROUNDS = [
  { name: 'Seed round', stake: 0.15, minRep: 10 },
  { name: 'Series A', stake: 0.15, minRep: 25 },
  { name: 'Series B', stake: 0.15, minRep: 40 },
] as const;

export function nextFunding(s: GameState): (typeof FUNDING_ROUNDS)[number] | undefined {
  return FUNDING_ROUNDS[s.company.fundingRounds ?? 0];
}

/** What investors would pay for the next round (they buy at the current valuation, a little discounted). */
export function fundingAmount(s: GameState): number {
  const r = nextFunding(s);
  return r ? Math.round(valuation(s) * r.stake * 0.9) : 0;
}

export function fundingBlocked(s: GameState): string | null {
  const r = nextFunding(s);
  if (s.finance.stock) return 'You’re public now';
  if (!r) return 'No more private rounds — next stop, the stock market';
  if (fromDay(s.day).year < 1983) return 'Venture capital discovers games in 1983';
  if (s.company.reputation < r.minRep) return `Investors want reputation ${r.minRep}+`;
  if (s.company.lastFundingDay !== undefined && s.day - s.company.lastFundingDay < 365) return 'Investors want a year of results before the next round';
  if (fundingAmount(s) < money(50_000, s.day)) return 'Too small for investors to bother';
  return null;
}

export function raiseFunding(s: GameState): string | null {
  const why = fundingBlocked(s);
  if (why) return why;
  const r = nextFunding(s)!;
  const amount = fundingAmount(s);
  s.company.cash += amount; // equity: not revenue
  s.company.investorStake = (s.company.investorStake ?? 0) + r.stake;
  s.company.fundingRounds = (s.company.fundingRounds ?? 0) + 1;
  s.company.lastFundingDay = s.day;
  pushNews(s, { category: 'studio', headline: `${s.company.name} closes a ${fmtMoney(amount)} ${r.name.toLowerCase()}`, body: `Investors now own ${Math.round((s.company.investorStake ?? 0) * 100)}% of the studio.`, tone: 'good' });
  return null;
}

export function doIPO(s: GameState, sellPct: number): number {
  const val = valuation(s);
  const shares = BALANCE.SHARES_OUTSTANDING;
  const price = Math.max(1, (val * 1.1) / shares);
  const stake = s.company.investorStake ?? 0;
  // venture investors cash out into the IPO first; new shares make up the rest
  const sold = Math.round(shares * clamp(Math.max(sellPct, stake), 0.1, 0.49));
  const newShares = Math.max(0, sold - Math.round(shares * stake));
  const raised = newShares * price * 0.94; // underwriting fees; the investors' shares pay them, not you
  s.finance.stock = {
    shares,
    founderShares: shares - sold,
    price,
    history: [price],
    ipoDay: s.day,
    ipoPrice: price,
    expectation: Math.max(0, annualProfit(s) / 4) * 1.05,
    boardMood: 70,
    dividendsPaid: 0,
  };
  s.company.publicSince = s.day;
  s.company.investorStake = 0; // they sold out at the IPO
  s.company.cash += Math.round(raised); // equity raise: not revenue, not taxable
  return raised;
}

export function stockWeekly(c: Ctx): void {
  const { s, rng } = c;
  const st = s.finance.stock;
  if (!st) return;
  const fundamental = Math.max(0.5, valuation(s) / st.shares);
  const hype = Object.values(s.projects).reduce((m, p) => (p.kind === 'game' ? Math.max(m, p.hype) : m), 0);
  const target = fundamental * (1 + hype * 0.04) * (0.85 + st.boardMood / 400);
  const drift = (target - st.price) * 0.08;
  st.price = Math.max(0.05, st.price + drift + rng.normal(0, st.price * 0.03));
  st.history.push(Math.round(st.price * 100) / 100);
  if (st.history.length > 520) st.history.shift();
  const mv = st.price * st.shares;
  if (mv > s.progress.stats.peakValuation) s.progress.stats.peakValuation = mv;
}

/** Quarterly earnings vs board expectations. */
export function quarterlyEarnings(c: Ctx): void {
  const { s } = c;
  const st = s.finance.stock;
  if (!st) return;
  const q = s.finance.ledger.slice(-4, -1);
  let profit = 0;
  for (const m of q) profit += sum(Object.values(m.income).map((v) => v ?? 0)) - sum(Object.values(m.expense).map((v) => v ?? 0));
  const beat = profit >= st.expectation;
  st.boardMood = clamp(st.boardMood + (beat ? 8 : -12), 0, 100);
  st.price *= beat ? 1.06 : 0.9;
  pushNews(s, {
    category: 'studio',
    headline: beat ? `${s.company.name} beats earnings expectations` : `${s.company.name} misses earnings expectations`,
    body: `Quarterly profit ${Math.round(profit / 1e3)}k vs ${Math.round(st.expectation / 1e3)}k expected. Board mood ${Math.round(st.boardMood)}%.`,
    tone: beat ? 'good' : 'bad',
  });
  // expectations track recent performance (they can fall after a bad year)
  st.expectation = Math.max(0, (st.expectation * 0.5 + profit * 0.5) * 1.04);
  if (st.boardMood < 25) {
    s.company.moraleMods.push({ v: -6, until: s.day + 90, label: 'Board pressure' });
  }
}

export function yearOf(s: GameState): number {
  return fromDay(s.day).year;
}

/** Sell more shares (secondary offering): cash now, less control. */
export function secondaryOffering(s: GameState, pct: number): number {
  const st = s.finance.stock;
  if (!st) return 0;
  const n = Math.round(st.shares * pct);
  const sell = Math.min(n, st.founderShares);
  if (sell <= 0) return 0;
  const raised = sell * st.price * 0.92;
  st.founderShares -= sell;
  st.price *= 0.96;
  s.company.cash += Math.round(raised);
  return raised;
}
