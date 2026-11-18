/**
 * Finance: monthly payroll/rent/upkeep, loans & credit, taxes, insolvency → bankruptcy,
 * company valuation, IPO and the stock price.
 */
import { academyBudget } from './academy';
import { MOD_BUDGET } from './community';
import { leagueMonthlyCost, leaguePrize } from './esports';
import { BRANCH } from '../../data/regions';
import { BALANCE } from '../../data/balance';
import { ITEM_BY_ID } from '../../data/facilities';
import { clamp } from '../breakdown';
import { fromDay, interp, yearFrac } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Loan, MonthLedger } from '../types';
import { earn, financing, fmtMoney, inflation, money, newId, pushNews, spend, sum } from '../util';
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
  financing(s, amount); // borrowed money is not revenue
  return loan;
}

export function repayLoan(s: GameState, id: string): boolean {
  const loan = s.finance.loans.find((l) => l.id === id);
  if (!loan || s.company.cash < loan.remaining) return false;
  financing(s, -loan.remaining);
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

/** Everything that leaves the bank on the 1st of each month, whatever you do (the runway and insolvency checks use it). */
export function monthlyBurn(s: GameState): number {
  const payroll = payrollMonthly(s);
  const owed = s.company.perksOwed ?? {};
  let burn = payroll + monthlyRent(s) + monthlyUpkeep(s) + sum(s.finance.loans.map((l) => l.monthly));
  if (s.company.policies.wellness || owed.wellness) burn += WELLNESS_COST * inflation(s.day) * Object.keys(s.staff).length;
  if (s.company.policies.salaryPolicy === 'generous' || owed.generous) burn += payroll * 0.08;
  burn += Math.max(s.company.recruiting, owed.recruiting ?? 0) * 1_500 * inflation(s.day);
  if (s.company.academy) burn += academyBudget(s, s.company.academy.funding);
  if (s.community) burn += money(MOD_BUDGET[s.community.mods] ?? 0, s.day);
  for (const lg of s.leagues ?? []) if (lg.status === 'live') burn += leagueMonthlyCost(s, lg.tier) + leaguePrize(s, lg.tier) / 12;
  return burn;
}

/** First day of each month: pay bills, roll the ledger, check solvency. */
export function financeMonthly(c: Ctx): void {
  const { s } = c;
  // Close the previous month
  const prev = s.finance.ledger[s.finance.ledger.length - 1];
  if (prev) {
    prev.cashEnd = s.company.cash;
    const rev = sum(Object.values(prev.income).map((v) => v ?? 0));
    // selling assets (IP, furniture) is cash, not trading revenue: it doesn't make the studio look bigger
    s.finance.revenue12m.push(rev - (prev.income.asset_sales ?? 0));
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
  // perks used at any point last month are paid for (no dodging the bill by switching off before the 1st)
  const owed = s.company.perksOwed ?? {};
  if (s.company.policies.wellness || owed.wellness) spend(s, 'other_expense', WELLNESS_COST * inflation(s.day) * Object.keys(s.staff).length);
  const rec = Math.max(s.company.recruiting, owed.recruiting ?? 0);
  if (rec > 0) spend(s, 'recruiting', rec * 1_500 * inflation(s.day));
  if (s.company.policies.salaryPolicy === 'generous' || owed.generous) spend(s, 'salaries', payrollMonthly(s) * 0.08);
  // what's on now is owed next month even if switched off before then
  s.company.perksOwed = { generous: s.company.policies.salaryPolicy === 'generous', wellness: !!s.company.policies.wellness, recruiting: s.company.recruiting };
  // Loans
  for (const loan of s.finance.loans) {
    const interest = loan.remaining * (loan.rate / 12);
    const principal = Math.min(loan.remaining, loan.monthly - interest);
    spend(s, 'loan_interest', interest);
    financing(s, -principal);
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

/** Days left to get cash positive before bankruptcy (the full grace period if you're not insolvent yet). */
export function insolvencyDaysLeft(s: GameState): number {
  const grace = BALANCE.BANKRUPTCY_GRACE_DAYS[s.settings.difficulty];
  return Math.max(0, grace - (s.company.insolventSince === undefined ? 0 : s.day - s.company.insolventSince));
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
    // operating profit: one-off asset sales don't count (they'd inflate valuation, funding and credit)
    p += sum(Object.values(m.income).map((v) => v ?? 0)) - (m.income.asset_sales ?? 0) - sum(Object.values(m.expense).map((v) => v ?? 0));
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

/** What the founder's stake is worth: venture investors own part of a private studio, shareholders part of a public one. */
export function ownerValue(s: GameState): number {
  const st = s.finance.stock;
  return valuation(s) * (st ? st.founderShares / Math.max(1, st.shares) : 1 - (s.company.investorStake ?? 0));
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
  financing(s, amount); // equity: not revenue
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
  financing(s, raised); // equity raise: not revenue, not taxable
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
  const mv = st.price * st.founderShares; // the founder's stake at market price
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
    body: `Quarterly profit ${fmtMoney(profit)} vs ${fmtMoney(st.expectation)} expected. Board mood ${Math.round(st.boardMood)}%.`,
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

/** Your stake after issuing `pct` more shares. */
export function controlAfterOffering(st: { shares: number; founderShares: number }, pct: number): number {
  return st.founderShares / (st.shares + Math.round(st.shares * pct));
}

/**
 * Issue new shares (a follow-on offering): cash for the studio, and your stake is diluted. The new money is
 * spread over more shares, so it can't conjure value per share out of nothing.
 */
/** Days between follow-on offerings: investors won't buy share sale after share sale. */
export const OFFERING_GAP = 180;

export function offeringBlocked(s: GameState): string | null {
  const st = s.finance.stock;
  if (!st) return 'Not public';
  if (st.lastOffering !== undefined && s.day - st.lastOffering < OFFERING_GAP) return `Investors need time to digest your last share sale (${Math.ceil((OFFERING_GAP - (s.day - st.lastOffering)) / 30)} more month${OFFERING_GAP - (s.day - st.lastOffering) > 30 ? 's' : ''})`;
  return null;
}

export function secondaryOffering(s: GameState, pct: number): number {
  const st = s.finance.stock;
  if (!st || offeringBlocked(s)) return 0;
  const n = Math.round(st.shares * pct);
  if (n <= 0 || controlAfterOffering(st, pct) < 0.05) return 0;
  const raised = n * st.price * 0.92;
  // the company is worth what it was plus the cash it raised, spread over more shares (no value from thin air)
  st.price = (st.price * st.shares + raised) / (st.shares + n);
  st.shares += n;
  st.lastOffering = s.day;
  financing(s, raised);
  return raised;
}
