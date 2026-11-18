import { useState } from 'react';
import { fromDay, formatDate, MONTHS } from '@/sim/calendar';
import { fmtMoney, sum } from '@/sim/util';
import { annualProfit, creditLimit, loanRate, monthlyBurn, trailingRevenue, valuation } from '@/sim/systems/finance';
import type { LedgerCat } from '@/sim/types';
import { BarChart, LineChart, StackedArea } from '../charts';
import { Button, Field, Section, Segmented, Stat, inputCls } from '../components/ui';
import { useGame } from '../store';

const CAT_LABEL: Record<LedgerCat, string> = {
  sales: 'Game sales',
  contracts: 'Contracts',
  licensing: 'Engine licensing',
  live: 'Live service',
  merch: 'Merchandise',
  subsidiaries: 'Subsidiaries',
  advances: 'Publisher advances',
  interest_income: 'Interest',
  asset_sales: 'Asset sales',
  other_income: 'Other income',
  hardware: 'Hardware sales',
  platform_fees: 'Platform licence fees',
  subscriptions: 'Subscription pass',
  esports: 'Esports leagues',
  publishing: 'Published indie games',
  advances_paid: 'Advances to indies',
  hardware_rd: 'Hardware R&D',
  manufacturing: 'Manufacturing',
  salaries: 'Salaries',
  rent: 'Rent',
  upkeep: 'Upkeep',
  servers: 'Servers',
  devkits: 'Dev kits & licences',
  marketing: 'Marketing',
  research: 'Research',
  training: 'Training',
  loan_interest: 'Loan interest',
  taxes: 'Taxes',
  recruiting: 'Recruiting',
  office: 'Office',
  royalties: 'Royalties paid',
  acquisitions: 'Acquisitions',
  other_expense: 'Production',
};

export default function FinancePanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [range, setRange] = useState<12 | 36 | 120>(12);
  const limit = creditLimit(s);
  const [amount, setAmount] = useState(() => Math.round(Math.min(limit, 50_000) / 1000) * 1000);
  const [months, setMonths] = useState(36);
  const ledger = s.finance.ledger.slice(-range - 1, -1);
  const rate = loanRate(s);
  const profit = annualProfit(s);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Cash" value={fmtMoney(s.company.cash)} tone={s.company.cash < 0 ? 'bad' : undefined} />
        <Stat label="Revenue (12 mo)" value={fmtMoney(trailingRevenue(s))} />
        <Stat label="Profit (12 mo)" value={fmtMoney(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
        <Stat label="Monthly burn" value={fmtMoney(monthlyBurn(s))} sub="salaries, rent, upkeep, loans" />
        <Stat label="Valuation" value={fmtMoney(valuation(s))} />
        <Stat label="Credit score" value={Math.round(s.company.creditScore)} sub={`limit ${fmtMoney(limit)}`} />
      </div>
      <Segmented
        ariaLabel="Time range"
        value={range}
        onChange={setRange}
        className="mb-2"
        options={[
          { value: 12, label: '1 year' },
          { value: 36, label: '3 years' },
          { value: 120, label: '10 years' },
        ]}
      />
      <Section title="Cash">
        <LineChart
          ariaLabel="Cash over time"
          area
          height={160}
          series={[{ name: 'Cash', points: [...s.finance.ledger.slice(0, -1).slice(-range).map((m) => ({ x: m.day, y: m.cashEnd })), { x: s.day, y: s.company.cash }] }]} // …and today
          xFormat={(d) => (range <= 12 ? MONTHS[fromDay(d).month - 1]! : String(fromDay(d).year))}
          yFormat={(v) => fmtMoney(v)}
        />
      </Section>
      <Section title="Profit & loss by month">
        <BarChart
          ariaLabel="Monthly income and expenses"
          height={180}
          yFormat={(v) => fmtMoney(v)}
          data={ledger.map((m) => {
            const d = fromDay(m.day);
            const inc = sum(Object.values(m.income).map((v) => v ?? 0));
            const exp = sum(Object.values(m.expense).map((v) => v ?? 0));
            return {
              label: range <= 12 ? MONTHS[d.month - 1]! : `${MONTHS[d.month - 1]} ${String(d.year).slice(2)}`,
              segments: [
                { key: 'Income', value: inc, color: 'var(--good)' },
                { key: 'Expenses', value: -exp, color: 'var(--bad)' },
              ],
            };
          })}
        />
      </Section>
      <RevenueMix months={range} />
      <Section title="Last month in detail">
        <LastMonth />
      </Section>
      <Section title="Loans">
        {s.finance.loans.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {s.finance.loans.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-xs">
                <div>
                  <div className="text-sm font-semibold">{fmtMoney(l.remaining)} remaining</div>
                  <div className="text-ink3">
                    {(l.rate * 100).toFixed(1)}% · {fmtMoney(l.monthly)}/mo · {l.monthsLeft} months left · taken {formatDate(l.takenDay, false)}
                  </div>
                </div>
                <Button size="sm" disabled={s.company.cash < l.remaining} onClick={() => useGame.getState().actOrToast({ type: 'repayLoan', loanId: l.id }, 'Loan repaid')}>
                  Repay
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={`Amount (max ${fmtMoney(limit)})`}>
            <input type="number" className={inputCls} min={1000} step={1000} max={limit} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label={`Term · ${(rate * 100).toFixed(1)}% APR`}>
            <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[12, 24, 36, 60, 120].map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="primary"
            disabled={amount <= 0 || amount > limit}
            onClick={() => {
              const r = act({ type: 'takeLoan', amount, months });
              toast(r.ok ? { text: `Borrowed ${fmtMoney(amount)}`, tone: 'neutral', icon: 'cash' } : { text: r.error, tone: 'bad' });
            }}
          >
            Borrow
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">Your credit limit grows with revenue and valuation. Missed payments (negative cash) hurt your credit score.</p>
      </Section>
    </div>
  );
}

function LastMonth() {
  const s = useGame((g) => g.s)!;
  const m = s.finance.ledger[s.finance.ledger.length - 2];
  if (!m) return <p className="text-xs text-ink3">Your first month isn’t over yet.</p>;
  const inc = Object.entries(m.income).filter(([, v]) => v) as [LedgerCat, number][];
  const exp = Object.entries(m.expense).filter(([, v]) => v) as [LedgerCat, number][];
  return (
    <div className="grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <div className="mb-1 font-semibold text-good">Income {fmtMoney(sum(inc.map((x) => x[1])))}</div>
        {inc.length === 0 && <div className="text-ink3">None</div>}
        {inc.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="text-ink2">{CAT_LABEL[k] ?? k}</span>
            <span className="num">{fmtMoney(v)}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 font-semibold text-bad">Expenses {fmtMoney(sum(exp.map((x) => x[1])))}</div>
        {exp.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="text-ink2">{CAT_LABEL[k] ?? k}</span>
            <span className="num">{fmtMoney(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Where the money comes from, grouped into a few readable streams. */
const STREAMS: { key: string; label: string; cats: LedgerCat[] }[] = [
  { key: 'games', label: 'Game sales', cats: ['sales', 'advances'] },
  { key: 'live', label: 'Live & merch', cats: ['live', 'merch'] },
  { key: 'work', label: 'Contracts & licensing', cats: ['contracts', 'licensing'] },
  { key: 'hardware', label: 'Hardware & platform fees', cats: ['hardware', 'platform_fees'] },
  { key: 'pass', label: 'Subscription pass', cats: ['subscriptions'] },
  { key: 'esports', label: 'Esports leagues', cats: ['esports'] },
  { key: 'label', label: 'Publishing label', cats: ['publishing'] },
  { key: 'subs', label: 'Subsidiaries', cats: ['subsidiaries'] },
  { key: 'other', label: 'Interest & other', cats: ['interest_income', 'asset_sales', 'other_income'] },
];

function RevenueMix({ months }: { months: number }) {
  const s = useGame((g) => g.s)!;
  const ledger = s.finance.ledger.slice(-months - 1, -1);
  const data = ledger.map((m) => {
    const values: Record<string, number> = {};
    for (const st of STREAMS) values[st.key] = sum(st.cats.map((c) => m.income[c] ?? 0));
    return { x: m.day, values };
  });
  const keys = STREAMS.filter((st) => data.some((d) => (d.values[st.key] ?? 0) > 0)).map((st) => st.key);
  if (keys.length < 2) return null; // one stream isn't a mix
  return (
    <Section title="Revenue mix">
      <StackedArea
        ariaLabel="Share of revenue by source"
        data={data}
        keys={keys}
        labels={Object.fromEntries(STREAMS.map((st) => [st.key, st.label]))}
        normalize
        height={170}
        xFormat={(d) => (months <= 12 ? MONTHS[fromDay(d).month - 1]! : String(fromDay(d).year))}
      />
    </Section>
  );
}
