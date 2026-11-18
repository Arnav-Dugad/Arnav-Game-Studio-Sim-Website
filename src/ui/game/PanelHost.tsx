import { lazy, Suspense, type ReactNode } from 'react';
import { Icon } from '../icons';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useGame, type PanelId } from '../store';

const DevelopPanel = lazy(() => import('../panels/DevelopPanel'));
const StaffPanel = lazy(() => import('../panels/StaffPanel'));
const OfficePanel = lazy(() => import('../panels/OfficePanel'));
const ResearchPanel = lazy(() => import('../panels/ResearchPanel'));
const MarketPanel = lazy(() => import('../panels/MarketPanel'));
const FinancePanel = lazy(() => import('../panels/FinancePanel'));
const CompanyPanel = lazy(() => import('../panels/CompanyPanel'));
const NewsPanel = lazy(() => import('../panels/NewsPanel'));
const GoalsPanel = lazy(() => import('../panels/GoalsPanel'));
const SettingsPanel = lazy(() => import('../panels/SettingsPanel'));
const ReleasesPanel = lazy(() => import('../panels/ReleasesPanel'));
const CheatsPanel = lazy(() => import('../panels/CheatsPanel'));
const OverviewPanel = lazy(() => import('../panels/OverviewPanel'));

const TITLES: Record<PanelId, string> = {
  develop: 'Develop',
  staff: 'Staff',
  office: 'Office',
  research: 'Research',
  market: 'Market',
  finance: 'Finance',
  company: 'Company',
  news: 'News',
  goals: 'Goals',
  settings: 'Settings',
  releases: 'Your Games',
  cheats: 'Cheats',
  overview: 'Studio Overview',
};

const PANELS: Record<PanelId, () => ReactNode> = {
  develop: () => <DevelopPanel />,
  staff: () => <StaffPanel />,
  office: () => <OfficePanel />,
  research: () => <ResearchPanel />,
  market: () => <MarketPanel />,
  finance: () => <FinancePanel />,
  company: () => <CompanyPanel />,
  news: () => <NewsPanel />,
  goals: () => <GoalsPanel />,
  settings: () => <SettingsPanel />,
  releases: () => <ReleasesPanel />,
  cheats: () => <CheatsPanel />,
  overview: () => <OverviewPanel />,
};

export function PanelHost() {
  const panel = useGame((g) => g.panel);
  const openPanel = useGame((g) => g.openPanel);
  const loaded = useGame((g) => !!g.s); // panels always read the game: never render one without it
  if (!panel || !loaded) return null;
  return (
    <aside
      aria-label={TITLES[panel]}
      className="glass absolute inset-x-2 bottom-[calc(4rem+var(--tut-strip,0rem))] top-auto z-30 flex max-h-[62vh] flex-col rounded-2xl animate-fade-up sm:inset-x-auto sm:bottom-3 sm:left-[4.75rem] sm:top-[7.25rem] xl:top-[4.5rem] sm:max-h-none sm:w-[min(560px,calc(100vw-6rem))]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-lg font-semibold">{TITLES[panel]}</h2>
        <button type="button" aria-label="Close panel (Esc)" onClick={() => openPanel(null)} className="grid size-8 place-items-center rounded-lg text-ink3 hover:bg-bg2 hover:text-ink">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scroll-thin">
        <ErrorBoundary inline key={panel}>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-bg2" />}>{PANELS[panel]()}</Suspense>
        </ErrorBoundary>
      </div>
    </aside>
  );
}
