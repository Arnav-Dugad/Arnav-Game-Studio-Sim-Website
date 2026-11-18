import { fromDay, MONTHS } from '@/sim/calendar';
import type { LedgerCat } from '@/sim/types';

/** Axis label for a day index: years for long spans, "Mon 'YY" for short ones. */
export function dayAxis(spanDays: number): (d: number) => string {
  return (d: number) => {
    const c = fromDay(d);
    return spanDays > 365 * 3 ? String(c.year) : `${MONTHS[c.month - 1]} '${String(c.year).slice(2)}`;
  };
}

/** What each ledger line is called, everywhere money is shown. */
export const CAT_LABEL: Record<LedgerCat, string> = {
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
  other_expense: 'Production & other costs',
};

/** A share price: cents while it's small, thousands separators once it isn't ("$12.40", "$9,077"). */
export function fmtSharePrice(v: number): string {
  return v >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
}

/** Spoken names for the studio colour swatches. */
export const COLOR_NAMES: Record<string, string> = {
  '#e07a5f': 'Coral',
  '#3d85c6': 'Blue',
  '#9b6bd3': 'Purple',
  '#2eb5a8': 'Teal',
  '#e3b23c': 'Gold',
  '#d1495b': 'Red',
  '#5f9e6e': 'Green',
  '#334155': 'Slate',
  '#1f2937': 'Charcoal',
  '#c2410c': 'Burnt orange',
};
