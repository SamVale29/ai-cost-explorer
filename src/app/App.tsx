import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Download,
  ExternalLink,
  FileJson,
  Filter,
  Github,
  History,
  LayoutGrid,
  Lightbulb,
  Menu,
  Moon,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Table2,
  Target,
  X,
  Zap,
} from 'lucide-react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { calculateAll, resultAsText } from '../lib/calculator';
import { findOffer, hydrateOffers, loadCatalog, parseIds } from '../lib/catalog';
import { downloadText, formatCompactNumber, formatCurrency, formatDate, formatTokens, getStaleness, stalenessLabel, toCsv } from '../lib/format';
import { paretoFrontier, scoreOffers, type ParetoPoint } from '../lib/pareto';
import { loadSavedScenarios, MAX_SAVED_SCENARIOS, storeSavedScenarios, type SavedScenario } from '../lib/scenarios';
import { parseExplorerUrl, serializeExplorerUrl, type ExplorerUrlState } from '../lib/url-state';
import type { CalculatorInput, Catalog, OfferView, PricingRule } from '../types';

const GITHUB_URL = 'https://github.com/omentordotrader-afk/ai-cost-explorer';
const DISCLAIMER = 'AI Cost Explorer is an independent open-source project and is not affiliated with the model providers listed. Prices and capabilities may change. Always verify critical purchasing decisions with the provider’s official documentation.';

type CatalogContextValue = { catalog: Catalog; offers: OfferView[] };
const CatalogContext = createContext<CatalogContextValue | null>(null);

function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside CatalogContext');
  return value;
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadCatalog().then(setCatalog).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Catalog failed to load'));
  }, []);

  if (error) return <div className="fatal-state"><div><Sparkles size={28} /><h1>Catalog unavailable</h1><p>{error}</p><p>Run <code>pnpm data:build</code> before serving the app.</p></div></div>;
  if (!catalog) return <div className="loading-screen"><div className="loader-mark"><Sparkles size={22} /></div><p>Loading verified catalog…</p></div>;

  return <CatalogContext.Provider value={{ catalog, offers: hydrateOffers(catalog) }}><AppShell /></CatalogContext.Provider>;
}

function AppShell() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('ace-theme') as 'dark' | 'light' | null) ?? 'dark');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { catalog } = useCatalog();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ace-theme', theme);
  }, [theme]);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const toggleTheme = () => setTheme((value) => (value === 'dark' ? 'light' : 'dark'));
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-symbol"><span /><span /><span /></div>
          <div><div className="brand-name">AI Cost Explorer</div><div className="brand-kicker">PUBLIC BETA · v0.1.0</div></div>
        </div>
        <div className="sidebar-rule" />
        <nav className="side-nav">
          <div className="nav-label">WORKSPACE</div>
          <ShellNavLink to="/" icon={<LayoutGrid size={17} />} label="Overview" end />
          <ShellNavLink to="/explore" icon={<Table2 size={17} />} label="Model explorer" />
          <ShellNavLink to="/compare" icon={<ArrowDownUp size={17} />} label="Compare" />
          <ShellNavLink to="/calculator" icon={<BarChart3 size={17} />} label="Cost simulator" />
          <ShellNavLink to="/value" icon={<Target size={17} />} label="Value frontier" />
          <ShellNavLink to="/history" icon={<History size={17} />} label="Price history" />
          <div className="nav-label nav-label-spaced">REFERENCE</div>
          <ShellNavLink to="/methodology" icon={<BookOpen size={17} />} label="Methodology" />
          <a className="shell-nav-link" href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer"><Github size={17} /><span>Contribute</span><ExternalLink size={13} className="nav-external" /></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="data-health"><div className="health-dot" /><div><strong>{catalog.offers.length} offers monitored</strong><span>Data as of {formatDate(catalog.dataAsOf)}</span></div></div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><span>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>AI COST EXPLORER</span><ChevronDown size={13} /><strong>{pageTitle}</strong></div>
          <div className="topbar-actions"><span className="updated-label"><span className="pulse-dot" />Catalog checked {formatDate(catalog.dataAsOf)}</span><button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><a className="icon-button" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Open GitHub"><Github size={17} /></a></div>
        </header>
        <div className="page-frame"><Routes><Route path="/" element={<LandingPage />} /><Route path="/explore" element={<ExplorerPage />} /><Route path="/compare" element={<ComparePage />} /><Route path="/calculator" element={<CalculatorPage />} /><Route path="/history" element={<HistoryPage />} /><Route path="/value" element={<ValuePage />} /><Route path="/methodology" element={<MethodologyPage />} /><Route path="/model/:modelId" element={<ModelPage />} /><Route path="*" element={<NotFoundPage />} /></Routes></div>
        <footer className="site-footer"><span>AI Cost Explorer · Independent open-source project · Built by Sam Vale</span><span><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a><span className="footer-separator">·</span><Link to="/methodology">Methodology</Link><span className="footer-separator">·</span>MIT License</span></footer>
      </main>
    </div>
  );
}

function getPageTitle(path: string) {
  if (path.startsWith('/explore')) return 'Model explorer';
  if (path.startsWith('/compare')) return 'Comparison workspace';
  if (path.startsWith('/calculator')) return 'Cost simulator';
  if (path.startsWith('/history')) return 'Price history';
  if (path.startsWith('/value')) return 'Value frontier';
  if (path.startsWith('/methodology')) return 'Methodology';
  if (path.startsWith('/model')) return 'Model detail';
  return 'Overview';
}

function ShellNavLink({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return <NavLink to={to} end={end} className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}>{icon}<span>{label}</span>{label === 'Model explorer' && <span className="nav-count">40+</span>}</NavLink>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function StatCard({ label, value, note, accent = 'mint', icon }: { label: string; value: string; note: string; accent?: 'mint' | 'gold' | 'blue' | 'purple'; icon: ReactNode }) {
  return <div className={`stat-card accent-${accent}`}><div className="stat-icon">{icon}</div><div><span className="stat-label">{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'mint' | 'gold' | 'blue' | 'danger' | 'purple' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Capability({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <span className="capability yes"><Check size={13} />Yes</span>;
  if (value === false) return <span className="capability no">No</span>;
  return <span className="capability unknown" title="Not verified">—</span>;
}

function StalenessBadge({ value }: { value: string | null | undefined }) {
  const staleness = getStaleness(value);
  const tone = staleness === 'fresh' ? 'mint' : staleness === 'aging' ? 'gold' : staleness === 'stale' ? 'danger' : 'neutral';
  return <Badge tone={tone}><span className={`staleness-dot ${staleness}`} />{stalenessLabel(staleness)}</Badge>;
}

function Price({ value, suffix = '' }: { value: number | null | undefined; suffix?: string }) {
  return <span className={value === null || value === undefined ? 'unknown-value' : ''}>{value === null || value === undefined ? 'Not verified' : `${formatCurrency(value, value < 0.01 ? 4 : 2)}${suffix}`}</span>;
}

function StandardRule({ offer }: { offer: OfferView }): PricingRule | undefined {
  return offer.pricing.find((rule) => rule.mode === 'standard');
}

function SourceList({ sources, compact = false }: { sources: OfferView['sources']; compact?: boolean }) {
  const unique = [...new Map(sources.map((source) => [source.url, source])).values()];
  return <div className={`source-list ${compact ? 'source-list-compact' : ''}`}>{unique.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span className="source-mark">↗</span><span>{source.title}</span><ExternalLink size={12} /></a>)}</div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function LandingPage() {
  const { catalog, offers } = useCatalog();
  const fresh = offers.filter((offer) => getStaleness(offer.lastVerifiedAt) === 'fresh').length;
  const preview = offers.slice(0, 6);
  const pricingEvents = catalog.history.length;
  return <>
    <section className="hero-panel"><div className="hero-copy"><div className="eyebrow"><span className="live-dot" />TRANSPARENT AI PRICING · PUBLIC BETA</div><h1>Choose the right<br /><em>AI model</em> before the bill arrives.</h1><p>Compare pricing, capabilities, context windows and verified sources across modern AI APIs. Then model the workload before you commit to a provider.</p><div className="hero-actions"><Link className="button button-primary" to="/explore">Explore models <ArrowRight size={16} /></Link><Link className="button button-ghost" to="/calculator">Estimate your cost <BarChart3 size={16} /></Link></div><div className="hero-footnote"><ShieldCheck size={15} /><span>Independent data · Field-level provenance · No affiliate links</span></div></div><div className="hero-visual"><div className="hero-visual-top"><span>LIVE CATALOG</span><span className="hero-status"><span className="pulse-dot" />updated {formatDate(catalog.dataAsOf)}</span></div><div className="mini-terminal"><div className="terminal-row terminal-header"><span>OFFER</span><span>INPUT</span><span>OUTPUT</span><span>CONTEXT</span></div>{preview.slice(0, 5).map((offer) => { const rule = StandardRule({ offer }); return <div className="terminal-row" key={offer.id}><span><b>{offer.model.name}</b><small>{offer.provider.name.replace(' API', '')}</small></span><span className="price-mint"><Price value={rule?.inputPrice} /></span><span><Price value={rule?.outputPrice} /></span><span>{offer.model.contextWindowTokens ? formatCompactNumber(offer.model.contextWindowTokens) : '—'}</span></div>; })}<div className="terminal-row terminal-footer"><span>+ {Math.max(0, offers.length - 5)} more verified offers</span><Link to="/explore">Open explorer <ArrowRight size={13} /></Link></div></div><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /></div></section>
    <section className="stats-grid"><StatCard label="Offers monitored" value={String(catalog.offers.length)} note="Across direct API providers" accent="mint" icon={<Table2 size={18} />} /><StatCard label="API providers" value={String(catalog.providers.length)} note="No reseller mixing" accent="blue" icon={<Zap size={18} />} /><StatCard label="Official sources" value={String(catalog.sources.length)} note="Linked at field level" accent="gold" icon={<ShieldCheck size={18} />} /><StatCard label="Freshly checked" value={`${fresh}/${offers.length}`} note={`${pricingEvents} initial history observations`} accent="purple" icon={<History size={18} />} /></section>
    <section className="section-block"><div className="section-heading"><div><div className="eyebrow">THE CATALOG</div><h2>A sharper starting point than a price list.</h2></div><Link className="text-link" to="/explore">View all offers <ArrowRight size={14} /></Link></div><div className="table-card preview-card"><div className="preview-toolbar"><div className="toolbar-title"><span className="toolbar-dot" />Representative offers</div><span className="toolbar-note">Standard token rates · USD / 1M tokens</span></div><div className="table-scroll"><table className="data-table preview-table"><thead><tr><th>Model</th><th>Provider</th><th>Input / cache</th><th>Output</th><th>Context</th><th>Status</th></tr></thead><tbody>{preview.map((offer) => <OfferTableRow key={offer.id} offer={offer} compact />)}</tbody></table></div></div></section>
    <section className="split-section"><div className="info-card dark-card"><div className="eyebrow">WHY THIS EXISTS</div><h2>Cost is a product decision, not a spreadsheet footnote.</h2><p>Pricing is only one dimension. Context, modalities, tools, caching, batch discounts and observed performance can change which offer is actually economical for your workload.</p><Link className="button button-small button-dark" to="/methodology">Read the methodology <ArrowRight size={14} /></Link></div><div className="info-card transparent-card"><div className="eyebrow">TRANSPARENT BY DESIGN</div><div className="principle-list"><div><CheckCircle2 size={18} /><span><strong>Offer-level economics</strong><small>Model, API provider and commercial offer are distinct entities.</small></span></div><div><CheckCircle2 size={18} /><span><strong>Provenance, not confidence theater</strong><small>Unknown fields stay unknown; every source is one click away.</small></span></div><div><CheckCircle2 size={18} /><span><strong>Observed is not official</strong><small>Benchmarks remain separate from provider specifications.</small></span></div></div></div></section>
    <section className="cta-strip"><div><div className="eyebrow">BUILD WITH US</div><h2>Help keep the catalog honest.</h2><p>Suggest a provider, correct a price, or submit a reproducible benchmark. The data is versioned in GitHub for review.</p></div><div className="cta-actions"><a className="button button-primary" href={`${GITHUB_URL}/issues/new/choose`} target="_blank" rel="noreferrer">Open an issue <ExternalLink size={15} /></a><Link className="button button-ghost" to="/methodology">How verification works <BookOpen size={15} /></Link></div></section>
    <p className="disclaimer">{DISCLAIMER}</p>
  </>;
}

function OfferTableRow({ offer, compact = false, selected = false, onSelect }: { offer: OfferView; compact?: boolean; selected?: boolean; onSelect?: () => void }) {
  const rule = StandardRule({ offer });
  return <tr className={selected ? 'row-selected' : ''}><td className="model-cell"><div className="model-avatar">{offer.model.name.slice(0, 1)}</div><div><Link className="model-name-link" to={`/model/${offer.model.id}`}>{offer.model.name}</Link><small>{offer.apiModelId}</small></div></td><td><span className="provider-name">{offer.provider.name.replace(' API', '').replace('Cloud', '')}</span><small className="org-name">{offer.organization.name}</small></td><td className="numeric-cell"><Price value={rule?.inputPrice} /><small>{rule?.cachedInputPrice === null || rule?.cachedInputPrice === undefined ? 'cache —' : `cache ${formatCurrency(rule.cachedInputPrice, 3)}`}</small></td><td className="numeric-cell"><Price value={rule?.outputPrice} /></td><td className="numeric-cell">{formatTokens(offer.model.contextWindowTokens)}</td><td>{compact ? <StalenessBadge value={offer.lastVerifiedAt} /> : <Badge tone={offer.availability.status === 'active' ? 'mint' : offer.availability.status === 'preview' ? 'gold' : 'danger'}>{offer.availability.status}</Badge>}</td>{onSelect && <td className="select-cell"><button className={`select-toggle ${selected ? 'selected' : ''}`} onClick={onSelect} aria-label={`${selected ? 'Remove' : 'Add'} ${offer.model.name} from comparison`} aria-pressed={selected}>{selected ? <Check size={14} /> : '+'}</button></td>}</tr>;
}

function ExplorerPage() {
  const { offers, catalog } = useCatalog();
  const location = useLocation();
  const navigate = useNavigate();
  const initial = useMemo(() => parseExplorerUrl(location.search), [location.search]);
  const [filters, setFilters] = useState<ExplorerUrlState>(initial);
  const [showFilters, setShowFilters] = useState(true);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'input', direction: 'asc' });
  const [selected, setSelected] = useState<string[]>(() => parseIds(new URLSearchParams(location.search).get('compare')));
  useEffect(() => setFilters(initial), [initial]);
  useEffect(() => { const query = serializeExplorerUrl(filters); if (query !== location.search) navigate({ search: query }, { replace: true }); }, [filters, location.search, navigate]);
  const capabilityOptions = [{ id: 'image', label: 'Image input' }, { id: 'audio', label: 'Audio input' }, { id: 'video', label: 'Video input' }, { id: 'functionCalling', label: 'Function calling' }, { id: 'structuredOutputs', label: 'Structured outputs' }, { id: 'promptCaching', label: 'Prompt caching' }, { id: 'batchApi', label: 'Batch API' }, { id: 'reasoning', label: 'Reasoning' }, { id: 'realtime', label: 'Realtime' }, { id: 'webSearch', label: 'Web search' }, { id: 'computerUse', label: 'Computer use' }];
  const matchesCap = (offer: OfferView, cap: string) => {
    if (cap === 'image' || cap === 'audio' || cap === 'video') return offer.model.modalities.input.includes(cap);
    return offer.model.capabilities[cap as keyof OfferView['model']['capabilities']] === true;
  };
  const filtered = useMemo(() => offers.filter((offer) => {
    const rule = StandardRule({ offer });
    const haystack = `${offer.model.name} ${offer.apiModelId} ${offer.provider.name} ${offer.organization.name}`.toLowerCase();
    if (filters.search && !haystack.includes(filters.search.toLowerCase())) return false;
    if (filters.providers.length && !filters.providers.includes(offer.providerId)) return false;
    if (filters.organization && offer.organization.id !== filters.organization) return false;
    if (filters.status && offer.availability.status !== filters.status) return false;
    if (filters.capabilities.some((cap) => !matchesCap(offer, cap))) return false;
    if (filters.recentOnly && getStaleness(offer.lastVerifiedAt) !== 'fresh') return false;
    if (filters.minInput !== undefined && (rule?.inputPrice === null || rule?.inputPrice === undefined || rule.inputPrice < filters.minInput)) return false;
    if (filters.maxInput !== undefined && (rule?.inputPrice === null || rule?.inputPrice === undefined || rule.inputPrice > filters.maxInput)) return false;
    if (filters.minOutput !== undefined && (rule?.outputPrice === null || rule?.outputPrice === undefined || rule.outputPrice < filters.minOutput)) return false;
    if (filters.maxOutput !== undefined && (rule?.outputPrice === null || rule?.outputPrice === undefined || rule.outputPrice > filters.maxOutput)) return false;
    if (filters.minContext !== undefined && (offer.model.contextWindowTokens === null || offer.model.contextWindowTokens === undefined || offer.model.contextWindowTokens < filters.minContext)) return false;
    return true;
  }), [filters, offers]);
  const sorted = [...filtered].sort((a, b) => {
    const get = (offer: OfferView) => { const rule = StandardRule({ offer }); if (sort.key === 'output') return rule?.outputPrice ?? Infinity; if (sort.key === 'context') return offer.model.contextWindowTokens ?? -1; if (sort.key === 'provider') return offer.provider.name; if (sort.key === 'status') return offer.availability.status; return rule?.inputPrice ?? Infinity; };
    const av = get(a); const bv = get(b); const comparison = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv); return sort.direction === 'asc' ? comparison : -comparison;
  });
  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 4 ? current : [...current, id]);
  const clearAll = () => setFilters({ search: '', providers: [], organization: '', status: '', capabilities: [], recentOnly: false });
  const updateFilter = <K extends keyof ExplorerUrlState>(key: K, value: ExplorerUrlState[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilterCount = filters.providers.length + filters.capabilities.length + [filters.search, filters.organization, filters.status, filters.recentOnly, filters.minInput, filters.maxInput, filters.minOutput, filters.maxOutput, filters.minContext].filter(Boolean).length;
  const exportRows = sorted.map((offer) => { const rule = StandardRule({ offer }); return { offerId: offer.id, model: offer.model.name, provider: offer.provider.name, apiModelId: offer.apiModelId, inputPriceUsdPerMillion: rule?.inputPrice ?? null, outputPriceUsdPerMillion: rule?.outputPrice ?? null, contextWindowTokens: offer.model.contextWindowTokens, lastVerifiedAt: offer.lastVerifiedAt }; });
  const shareCompare = () => { if (selected.length) navigate(`/compare?compare=${selected.join(',')}`); };
  return <>
    <PageHeader eyebrow="CATALOG / EXPLORER" title="Model explorer" description="Search verified offers, compare the economics, and keep unknowns visible." actions={<><button className="button button-ghost" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={16} />Filters {activeFilterCount > 0 && <span className="button-count">{activeFilterCount}</span>}</button><button className="button button-ghost" onClick={() => downloadText('ai-cost-explorer-catalog.json', JSON.stringify({ schemaVersion: catalog.schemaVersion, offers: exportRows }, null, 2), 'application/json')}><Download size={16} />Export JSON</button><button className="button button-primary" onClick={() => downloadText('ai-cost-explorer-catalog.csv', toCsv(exportRows), 'text/csv')}><Download size={16} />Export CSV</button></>} />
    <div className={`explorer-layout ${showFilters ? '' : 'filters-collapsed'}`}>
      {showFilters && <aside className="filter-panel"><div className="filter-heading"><span><Filter size={16} />Filter catalog</span><button className="clear-button" onClick={clearAll}>Clear all</button></div><label className="search-field"><Search size={16} /><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search model, provider or API ID" /></label><div className="filter-section"><label className="field-label" htmlFor="provider-select">Provider</label><select id="provider-select" value={filters.providers[0] ?? ''} onChange={(event) => updateFilter('providers', event.target.value ? [event.target.value] : [])}><option value="">All providers</option>{catalog.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div><div className="filter-section"><label className="field-label" htmlFor="organization-select">Organization</label><select id="organization-select" value={filters.organization} onChange={(event) => updateFilter('organization', event.target.value)}><option value="">All organizations</option>{catalog.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div><div className="filter-section"><label className="field-label" htmlFor="status-select">Lifecycle</label><select id="status-select" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="preview">Preview</option><option value="deprecated">Deprecated</option></select></div><div className="filter-section"><span className="field-label">Pricing range · USD / 1M</span><div className="range-grid"><input type="number" min="0" step="0.01" placeholder="Min input" value={filters.minInput ?? ''} onChange={(event) => updateFilter('minInput', event.target.value ? Number(event.target.value) : undefined)} /><input type="number" min="0" step="0.01" placeholder="Max input" value={filters.maxInput ?? ''} onChange={(event) => updateFilter('maxInput', event.target.value ? Number(event.target.value) : undefined)} /><input type="number" min="0" step="0.01" placeholder="Min output" value={filters.minOutput ?? ''} onChange={(event) => updateFilter('minOutput', event.target.value ? Number(event.target.value) : undefined)} /><input type="number" min="0" step="0.01" placeholder="Max output" value={filters.maxOutput ?? ''} onChange={(event) => updateFilter('maxOutput', event.target.value ? Number(event.target.value) : undefined)} /></div></div><div className="filter-section"><label className="field-label" htmlFor="context-input">Minimum context</label><div className="input-with-suffix"><input id="context-input" type="number" min="0" step="1000" value={filters.minContext ?? ''} onChange={(event) => updateFilter('minContext', event.target.value ? Number(event.target.value) : undefined)} placeholder="e.g. 128000" /><span>tokens</span></div></div><div className="filter-section"><span className="field-label">Required capabilities</span><div className="check-grid">{capabilityOptions.map((option) => <label key={option.id} className="check-label"><input type="checkbox" checked={filters.capabilities.includes(option.id)} onChange={(event) => updateFilter('capabilities', event.target.checked ? [...filters.capabilities, option.id] : filters.capabilities.filter((item) => item !== option.id))} /><span className="fake-check"><Check size={12} /></span>{option.label}</label>)}</div></div><label className="switch-label"><input type="checkbox" checked={filters.recentOnly} onChange={(event) => updateFilter('recentOnly', event.target.checked)} /><span className="switch" /><span>Only freshly verified</span></label></aside>}
      <section className="explorer-main"><div className="active-filters"><span className="result-count"><strong>{sorted.length}</strong> of {offers.length} offers</span>{activeFilterCount > 0 && <>{filters.search && <FilterChip label={`Search: ${filters.search}`} onRemove={() => updateFilter('search', '')} />}{filters.providers.map((provider) => <FilterChip key={provider} label={catalog.providers.find((item) => item.id === provider)?.name ?? provider} onRemove={() => updateFilter('providers', filters.providers.filter((item) => item !== provider))} />)}{filters.capabilities.map((capability) => <FilterChip key={capability} label={capabilityOptions.find((item) => item.id === capability)?.label ?? capability} onRemove={() => updateFilter('capabilities', filters.capabilities.filter((item) => item !== capability))} />)}<button className="clear-button" onClick={clearAll}>Clear all</button></>}</div><div className="table-card explorer-table-card"><div className="table-toolbar"><div><span className="toolbar-title">Verified offers</span><span className="toolbar-note">Select 2–4 for a side-by-side comparison</span></div><div className="toolbar-right"><span className="density-label">{selected.length}/4 selected</span>{selected.length >= 2 && <button className="button button-small button-primary" onClick={shareCompare}>Compare selected <ArrowRight size={14} /></button>}</div></div><div className="table-scroll"><table className="data-table explorer-table"><caption className="sr-only">Searchable AI model offers</caption><thead><tr><th>Model</th><SortableHeader label="Provider" sortKey="provider" sort={sort} setSort={setSort} /><SortableHeader label="Input / cache" sortKey="input" sort={sort} setSort={setSort} /><SortableHeader label="Output" sortKey="output" sort={sort} setSort={setSort} /><SortableHeader label="Context" sortKey="context" sort={sort} setSort={setSort} /><th>Modalities</th><th>Capabilities</th><th>Checked</th><th><span className="sr-only">Select</span></th></tr></thead><tbody>{sorted.map((offer) => <ExplorerRow key={offer.id} offer={offer} selected={selected.includes(offer.id)} onSelect={() => toggleSelected(offer.id)} />)}</tbody></table></div>{sorted.length === 0 && <EmptyState title="No offers match these filters" description="Clear a filter or broaden the price and context ranges to see more verified data." action={<button className="button button-small button-ghost" onClick={clearAll}>Clear filters</button>} />}</div></section>
    </div>
    {selected.length >= 2 && <div className="compare-dock"><div><span className="dock-icon"><ArrowDownUp size={17} /></span><span><strong>{selected.length} offers ready</strong><small>Side-by-side comparison is shareable</small></span></div><div className="dock-offers">{selected.map((id) => { const offer = findOffer(offers, id); return offer ? <Badge key={id} tone="blue">{offer.model.name}</Badge> : null; })}</div><button className="button button-primary" onClick={shareCompare}>Open comparison <ArrowRight size={15} /></button><button className="dock-close" onClick={() => setSelected([])} aria-label="Clear comparison selection"><X size={17} /></button></div>}
  </>;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) { return <span className="filter-chip">{label}<button onClick={onRemove} aria-label={`Remove ${label} filter`}><X size={12} /></button></span>; }
function SortableHeader({ label, sortKey, sort, setSort }: { label: string; sortKey: string; sort: { key: string; direction: 'asc' | 'desc' }; setSort: (value: { key: string; direction: 'asc' | 'desc' }) => void }) { const active = sort.key === sortKey; return <th><button className={`sort-header ${active ? 'active' : ''}`} onClick={() => setSort({ key: sortKey, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' })}>{label}<ArrowDownUp size={12} /></button></th>; }
function ExplorerRow({ offer, selected, onSelect }: { offer: OfferView; selected: boolean; onSelect: () => void }) { const rule = StandardRule({ offer }); return <tr className={selected ? 'row-selected' : ''}><td className="model-cell"><div className="model-avatar">{offer.model.name.slice(0, 1)}</div><div><Link className="model-name-link" to={`/model/${offer.model.id}`}>{offer.model.name}</Link><small>{offer.apiModelId}</small></div></td><td><span className="provider-name">{offer.provider.name.replace(' API', '').replace('Cloud', '')}</span><small className="org-name">{offer.organization.name}</small></td><td className="numeric-cell"><Price value={rule?.inputPrice} /><small>{rule?.cachedInputPrice == null ? 'cache —' : `cache ${formatCurrency(rule.cachedInputPrice, 3)}`}</small></td><td className="numeric-cell"><Price value={rule?.outputPrice} /></td><td className="numeric-cell">{formatTokens(offer.model.contextWindowTokens)}</td><td><span className="modality-list">{offer.model.modalities.input.map((item) => <span key={item}>{item}</span>)}</span></td><td><span className="capability-summary"><Capability value={offer.model.capabilities.functionCalling} /><Capability value={offer.model.capabilities.promptCaching} /></span></td><td><StalenessBadge value={offer.lastVerifiedAt} /></td><td className="select-cell"><button className={`select-toggle ${selected ? 'selected' : ''}`} onClick={onSelect} aria-label={`${selected ? 'Remove' : 'Add'} ${offer.model.name} from comparison`} aria-pressed={selected}>{selected ? <Check size={14} /> : '+'}</button></td></tr>; }

function ComparePage() {
  const { offers } = useCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const [diffOnly, setDiffOnly] = useState(false);
  const ids = parseIds(new URLSearchParams(location.search).get('compare'));
  const selected = ids.map((id) => findOffer(offers, id)).filter((offer): offer is OfferView => Boolean(offer)).slice(0, 4);
  const copyLink = async () => { const link = window.location.href; if (navigator.clipboard) await navigator.clipboard.writeText(link); else window.prompt('Copy comparison URL', link); };
  const downloadComparison = () => downloadText('ai-cost-explorer-comparison.json', JSON.stringify(selected.map((offer) => ({ id: offer.id, model: offer.model.name, provider: offer.provider.name, pricing: offer.pricing, capabilities: offer.model.capabilities })), null, 2), 'application/json');
  if (selected.length < 2) return <><PageHeader eyebrow="WORKSPACE / COMPARE" title="Comparison workspace" description="Select two to four offers from the explorer to see the differences that matter." actions={<Link className="button button-primary" to="/explore">Choose offers <ArrowRight size={16} /></Link>} /><EmptyState title="Your comparison is empty" description="The comparison URL keeps selections shareable. Start from the model explorer." action={<Link className="button button-small button-ghost" to="/explore">Open model explorer</Link>} /></>;
  const rows: Array<{ label: string; values: ReactNode[]; compare?: boolean }> = [
    { label: 'Input price / 1M', values: selected.map((offer) => <Price key={offer.id} value={StandardRule({ offer })?.inputPrice} />), compare: true },
    { label: 'Cached input / 1M', values: selected.map((offer) => <Price key={offer.id} value={StandardRule({ offer })?.cachedInputPrice} />), compare: true },
    { label: 'Output price / 1M', values: selected.map((offer) => <Price key={offer.id} value={StandardRule({ offer })?.outputPrice} />), compare: true },
    { label: 'Context window', values: selected.map((offer) => <span key={offer.id}>{formatTokens(offer.model.contextWindowTokens)}</span>), compare: true },
    { label: 'Max output', values: selected.map((offer) => <span key={offer.id}>{formatTokens(offer.model.maxOutputTokens)}</span>), compare: true },
    { label: 'Input modalities', values: selected.map((offer) => <span key={offer.id} className="modality-list">{offer.model.modalities.input.join(' · ')}</span>) },
    { label: 'Output modalities', values: selected.map((offer) => <span key={offer.id} className="modality-list">{offer.model.modalities.output.join(' · ')}</span>) },
    { label: 'Function calling', values: selected.map((offer) => <Capability key={offer.id} value={offer.model.capabilities.functionCalling} />), compare: true },
    { label: 'Structured outputs', values: selected.map((offer) => <Capability key={offer.id} value={offer.model.capabilities.structuredOutputs} />), compare: true },
    { label: 'Prompt caching', values: selected.map((offer) => <Capability key={offer.id} value={offer.model.capabilities.promptCaching} />), compare: true },
    { label: 'Batch API', values: selected.map((offer) => <Capability key={offer.id} value={offer.model.capabilities.batchApi} />), compare: true },
    { label: 'Reasoning', values: selected.map((offer) => <Capability key={offer.id} value={offer.model.capabilities.reasoning} />), compare: true },
    { label: 'Last verified', values: selected.map((offer) => <StalenessBadge key={offer.id} value={offer.lastVerifiedAt} />) },
  ];
  const displayRows = rows.filter((row) => !diffOnly || !row.compare || row.values.some((value, index, all) => String(value) !== String(all[0]) && index > 0));
  return <><PageHeader eyebrow="WORKSPACE / COMPARE" title="Comparison workspace" description={`${selected.length} offers · unknowns stay visible instead of becoming false negatives.`} actions={<><button className="button button-ghost" onClick={copyLink}><Share2 size={16} />Copy link</button><button className="button button-ghost" onClick={downloadComparison}><Download size={16} />Export JSON</button><button className="button button-primary" onClick={() => window.print()}><Download size={16} />Print view</button></>} /><div className="comparison-controls"><div className="compare-selected-list">{selected.map((offer) => <div key={offer.id} className="compare-offer-chip"><span className="model-avatar small-avatar">{offer.model.name.slice(0, 1)}</span><span><strong>{offer.model.name}</strong><small>{offer.provider.name}</small></span><button onClick={() => navigate(`/compare?compare=${ids.filter((id) => id !== offer.id).join(',')}`)} aria-label={`Remove ${offer.model.name}`}><X size={14} /></button></div>)}</div><label className="switch-label"><input type="checkbox" checked={diffOnly} onChange={(event) => setDiffOnly(event.target.checked)} /><span className="switch" /><span>Show differences only</span></label></div><div className="comparison-card table-card"><div className="comparison-grid" style={{ '--compare-columns': `200px repeat(${selected.length}, minmax(190px, 1fr))` } as React.CSSProperties}><div className="comparison-row comparison-head"><div className="comparison-label">Offer</div>{selected.map((offer) => <div key={offer.id} className="comparison-offer-head"><Badge tone={offer.availability.status === 'active' ? 'mint' : 'gold'}>{offer.availability.status}</Badge><Link to={`/model/${offer.model.id}`}><strong>{offer.model.name}</strong></Link><span>{offer.provider.name}</span><small>{offer.apiModelId}</small></div>)}</div>{displayRows.map((row) => <div className="comparison-row" key={row.label}><div className="comparison-label">{row.label}</div>{row.values.map((value, index) => <div className="comparison-value" key={`${row.label}-${selected[index]?.id}`}>{value}</div>)}</div>)}<div className="comparison-row comparison-sources"><div className="comparison-label">Official sources</div>{selected.map((offer) => <div className="comparison-value" key={offer.id}><SourceList sources={offer.sources} compact /></div>)}</div></div></div><div className="compare-note"><CircleHelp size={16} /><span>“Not verified” means the field was not confirmed in the linked official source. It is not a quality score.</span></div></>;
}

const DEFAULT_CALCULATOR_INPUT: CalculatorInput = { inputTokens: 5000, outputTokens: 1200, cachedInputTokens: 1500, cacheWriteTokens: 0, requestsPerDay: 25000, daysPerMonth: 30, retryRate: 0.03, batchRate: 0 };
const PRESETS: Array<{ id: string; label: string; description: string; input: CalculatorInput }> = [
  { id: 'support', label: 'Customer support chatbot', description: 'Short context, high daily volume', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 1800, outputTokens: 420, cachedInputTokens: 900, requestsPerDay: 50000 } },
  { id: 'rag', label: 'RAG assistant', description: 'Retrieved context with cache reuse', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 12000, outputTokens: 900, cachedInputTokens: 5000, requestsPerDay: 12000 } },
  { id: 'coding', label: 'Coding agent', description: 'Longer context and larger outputs', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 28000, outputTokens: 5000, cachedInputTokens: 18000, requestsPerDay: 4500 } },
  { id: 'documents', label: 'Document extraction', description: 'Multimodal or structured output', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 18000, outputTokens: 2400, requestsPerDay: 8000 } },
  { id: 'content', label: 'Content generation', description: 'Output-heavy creative workloads', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 2500, outputTokens: 3500, requestsPerDay: 9000 } },
  { id: 'batch', label: 'Batch classification', description: 'Asynchronous volume discount', input: { ...DEFAULT_CALCULATOR_INPUT, inputTokens: 3200, outputTokens: 250, requestsPerDay: 100000, batchRate: 1, retryRate: 0.01 } },
  { id: 'custom', label: 'Custom workload', description: 'Set every assumption yourself', input: DEFAULT_CALCULATOR_INPUT },
];

type ScenarioShelfProps = {
  scenarios: SavedScenario[];
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onLoad: (scenario: SavedScenario) => void;
  onDelete: (id: string) => void;
};

function ScenarioShelf({ scenarios, name, onNameChange, onSave, onLoad, onDelete }: ScenarioShelfProps) {
  return (
    <section className="scenario-shelf table-card" aria-labelledby="saved-scenarios-title">
      <div className="scenario-shelf-heading">
        <div>
          <span className="eyebrow">SAVED WORKLOADS</span>
          <h2 id="saved-scenarios-title">Keep a few assumptions nearby.</h2>
          <p>Saved only in this browser. Nothing is sent to a provider.</p>
        </div>
        <Badge tone="blue">{scenarios.length}/{MAX_SAVED_SCENARIOS}</Badge>
      </div>
      <div className="scenario-save-row">
        <label className="scenario-name-field">
          <span>Scenario name</span>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); }} placeholder="e.g. Support pilot" maxLength={60} />
        </label>
        <button className="button button-primary button-small" type="button" onClick={onSave} disabled={!name.trim()}><CheckCircle2 size={15} />Save current</button>
      </div>
      {scenarios.length > 0 ? <div className="scenario-list">{scenarios.map((scenario) => <article className="scenario-item" key={scenario.id}><div><strong>{scenario.name}</strong><small>{formatDate(scenario.savedAt)} · {scenario.selectedOfferIds.length} offers · {scenario.mode}</small></div><div className="scenario-item-actions"><button className="button button-ghost button-small" type="button" onClick={() => onLoad(scenario)}>Load</button><button className="icon-button" type="button" onClick={() => onDelete(scenario.id)} aria-label={`Delete ${scenario.name}`}><X size={14} /></button></div></article>)}</div> : <p className="scenario-empty">No saved scenarios yet. Name the current workload above to keep it.</p>}
    </section>
  );
}

function CalculatorPage() {
  const { offers } = useCatalog();
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_CALCULATOR_INPUT);
  const [preset, setPreset] = useState('support');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => offers.filter((offer) => offer.pricing[0]?.inputPrice !== null && offer.pricing[0]?.inputPrice !== undefined).slice(0, 6).map((offer) => offer.id));
  const [mode, setMode] = useState<'request' | 'daily' | 'monthly' | 'annual'>('monthly');
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadSavedScenarios());
  const [scenarioName, setScenarioName] = useState('');
  const selectedOffers = selectedIds.map((id) => findOffer(offers, id)).filter((offer): offer is OfferView => Boolean(offer));
  const results = calculateAll(selectedOffers, input);
  const resultById = new Map(results.map((result) => [result.offerId, result]));
  const cheapest = results.find((result) => result.monthlyCost !== null)?.monthlyCost ?? null;
  const update = <K extends keyof CalculatorInput>(key: K, value: CalculatorInput[K]) => { setPreset('custom'); setInput((current) => ({ ...current, [key]: value })); };
  const selectPreset = (id: string) => { const next = PRESETS.find((item) => item.id === id); if (next) { setPreset(id); setInput(next.input); } };
  const toggleOffer = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const saveScenario = () => { const name = scenarioName.trim(); if (!name) return; const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `scenario-${Date.now()}`; const scenario: SavedScenario = { id, name, savedAt: new Date().toISOString(), input: { ...input }, selectedOfferIds: [...selectedIds], mode }; const next = [scenario, ...savedScenarios].slice(0, MAX_SAVED_SCENARIOS); setSavedScenarios(next); storeSavedScenarios(next); setScenarioName(''); };
  const loadScenario = (scenario: SavedScenario) => { setInput({ ...scenario.input }); setSelectedIds(scenario.selectedOfferIds.filter((id) => offers.some((offer) => offer.id === id))); setMode(scenario.mode); setPreset('custom'); };
  const deleteScenario = (id: string) => { const next = savedScenarios.filter((scenario) => scenario.id !== id); setSavedScenarios(next); storeSavedScenarios(next); };
  const inputFields: Array<{ key: keyof CalculatorInput; label: string; suffix: string; step?: number }> = [{ key: 'inputTokens', label: 'Input tokens / request', suffix: 'tokens' }, { key: 'outputTokens', label: 'Output tokens / request', suffix: 'tokens' }, { key: 'cachedInputTokens', label: 'Cached input tokens', suffix: 'tokens' }, { key: 'cacheWriteTokens', label: 'Cache-write tokens', suffix: 'tokens' }, { key: 'requestsPerDay', label: 'Requests / day', suffix: 'req' }, { key: 'daysPerMonth', label: 'Days / month', suffix: 'days' }, { key: 'retryRate', label: 'Retry rate', suffix: '%', step: 0.01 }, { key: 'batchRate', label: 'Batch share', suffix: '%', step: 0.01 }];
  return <><PageHeader eyebrow="WORKSPACE / SIMULATOR" title="Estimate the bill before it arrives." description="Model real workloads with cache, batch, retries and long-context pricing tiers. Every total is an estimate, never a quote." actions={<><button className="button button-ghost" onClick={() => downloadText('ai-cost-estimate.json', JSON.stringify({ input, results }, null, 2), 'application/json')}><FileJson size={16} />Export JSON</button><button className="button button-primary" onClick={() => { const offer = selectedOffers[0]; const result = offer ? resultById.get(offer.id) : undefined; if (offer && result) downloadText('ai-cost-estimate.txt', resultAsText(result, offer, input)); }}><Clipboard size={16} />Copy estimate text</button></>} /><ScenarioShelf scenarios={savedScenarios} name={scenarioName} onNameChange={setScenarioName} onSave={saveScenario} onLoad={loadScenario} onDelete={deleteScenario} /><div className="calculator-layout"><section className="calculator-form-card table-card"><div className="calculator-section-heading"><div><span className="eyebrow">01 / WORKLOAD</span><h2>Shape the scenario</h2></div><Badge tone="gold">Estimate</Badge></div><div className="preset-grid">{PRESETS.map((item) => <button key={item.id} className={`preset-card ${preset === item.id ? 'active' : ''}`} onClick={() => selectPreset(item.id)}><span className="preset-icon">{item.id === 'custom' ? <Settings2 size={16} /> : <Sparkles size={16} />}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>{preset === item.id && <CheckCircle2 className="preset-check" size={16} />}</button>)}</div><div className="form-grid">{inputFields.map((field) => <label key={field.key} className="number-field"><span>{field.label}</span><div><input type="number" min="0" step={field.step ?? 1} value={field.key === 'retryRate' || field.key === 'batchRate' ? Number(input[field.key] ?? 0) * 100 : Number(input[field.key] ?? 0)} onChange={(event) => { const value = Number(event.target.value); update(field.key, (field.key === 'retryRate' || field.key === 'batchRate' ? value / 100 : value) as never); }} /><em>{field.suffix}</em></div></label>)}</div><div className="calculator-callout"><CircleHelp size={17} /><div><strong>Cache tokens are not counted twice.</strong><p>Standard input is calculated as total input minus cached input minus cache writes. Batch pricing blends only the chosen fraction of requests.</p></div></div></section><section className="offer-pick-card table-card"><div className="calculator-section-heading"><div><span className="eyebrow">02 / OFFERS</span><h2>Compare this workload</h2></div><span className="toolbar-note">{selectedOffers.length} selected</span></div><div className="offer-pick-list">{offers.map((offer) => { const selected = selectedIds.includes(offer.id); const rule = StandardRule({ offer }); return <label className={`offer-pick-row ${selected ? 'selected' : ''}`} key={offer.id}><input type="checkbox" checked={selected} onChange={() => toggleOffer(offer.id)} /><span className="fake-check"><Check size={12} /></span><span className="offer-pick-name"><strong>{offer.model.name}</strong><small>{offer.provider.name}</small></span><span className="offer-pick-price"><Price value={rule?.inputPrice} /><small>input / 1M</small></span></label>; })}</div></section></div><section className="results-section"><div className="results-heading"><div><div className="eyebrow">03 / RESULTS</div><h2>Monthly cost by offer</h2><p>Sorted from lowest to highest known monthly estimate.</p></div><div className="mode-toggle" role="group" aria-label="Cost display mode">{(['request', 'daily', 'monthly', 'annual'] as const).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>)}</div></div>{results.length === 0 ? <EmptyState title="Select at least one offer" description="Choose offers above to calculate the workload." /> : <><div className="result-cards">{results.map((result, index) => { const offer = findOffer(offers, result.offerId); if (!offer) return null; const value = mode === 'request' ? result.costPerRequest : mode === 'daily' ? result.dailyCost : mode === 'annual' ? result.annualCost : result.monthlyCost; const isCheapest = value !== null && (mode === 'monthly' ? result.monthlyCost === cheapest : index === 0); return <div className={`result-card ${isCheapest ? 'best' : ''}`} key={result.offerId}><div className="result-card-top"><span className="rank-pill">{String(index + 1).padStart(2, '0')}</span><StalenessBadge value={offer.lastVerifiedAt} /></div><Link to={`/model/${offer.model.id}`} className="result-model">{offer.model.name}</Link><span className="result-provider">{offer.provider.name}</span><strong className="result-price">{value === null ? 'Not verified' : formatCurrency(value, mode === 'request' ? 6 : 2)}</strong><span className="result-period">{mode === 'request' ? 'per request' : mode === 'daily' ? 'per day' : mode === 'annual' ? 'per year' : 'per month'}</span>{isCheapest && <Badge tone="mint">Lowest known estimate</Badge>}<div className="result-breakdown"><span>Input <b>{result.breakdown.standardInput === null ? '—' : formatCurrency(result.breakdown.standardInput, 4)}</b></span><span>Cache <b>{result.breakdown.cachedInput === null ? '—' : formatCurrency((result.breakdown.cachedInput ?? 0) + (result.breakdown.cacheWrite ?? 0), 4)}</b></span><span>Output <b>{result.breakdown.output === null ? '—' : formatCurrency(result.breakdown.output, 4)}</b></span></div>{result.warnings.length > 0 && <span className="warning-note"><CircleHelp size={13} />{result.warnings[0]}</span>}</div>; })}</div><div className="formula-card"><div><span className="eyebrow">CALCULATION MEMORY</span><h3>What the simulator applied</h3></div><code>standard input = (input − cached − writes) ÷ 1M × input rate<br />cached input = cached ÷ 1M × cache-hit rate<br />output = output ÷ 1M × output rate<br />{`monthly = request cost × requests/day × (1 + retry rate) × days/month`}</code><span className="formula-note">Batch share is blended only where the offer publishes a batch rule. Long-context tiers switch when the request input crosses the provider threshold.</span></div></>}</section><p className="disclaimer">{DISCLAIMER}</p></>;
}

function HistoryPage() {
  const { catalog, offers } = useCatalog();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const visible = catalog.history.filter((event) => { const offer = findOffer(offers, event.offerId); return offer && (!provider || offer.providerId === provider) && (!model || offer.modelId === model); });
  const values = visible.map((event) => event.currentPricing.find((rule) => rule.mode === 'standard')?.inputPrice ?? 0);
  const max = Math.max(...values, 1);
  return <><PageHeader eyebrow="AUDIT TRAIL / HISTORY" title="Price history without invented lines." description="The chart starts at the first project observation. A detected date and an effective date are kept separate." actions={<Link className="button button-primary" to="/explore">Browse offers <ArrowRight size={16} /></Link>} /><div className="history-toolbar table-card"><div><span className="toolbar-title">Filter observations</span><span className="toolbar-note">Backfill is only added when an official dated source exists.</span></div><div className="history-filters"><select aria-label="Filter by provider" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">All providers</option>{catalog.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by model" value={model} onChange={(event) => setModel(event.target.value)}><option value="">All models</option>{catalog.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div><div className="history-layout"><section className="chart-card table-card"><div className="chart-heading"><div><span className="eyebrow">INPUT PRICE · USD / 1M</span><h2>Known observations</h2></div><Badge tone="blue">{visible.length} events</Badge></div>{visible.length === 0 ? <EmptyState title="No observations match" description="Clear the provider or model filter to see the initial project snapshots." /> : <div className="history-bars" aria-label="Bar chart of known input price observations">{visible.map((event) => { const offer = findOffer(offers, event.offerId); const price = event.currentPricing.find((rule) => rule.mode === 'standard')?.inputPrice ?? null; return <div className="history-bar-item" key={event.id}><div className="history-bar-value">{price === null ? '—' : formatCurrency(price, 3)}</div><div className="history-bar-track"><div className="history-bar-fill" style={{ height: `${Math.max(8, ((price ?? 0) / max) * 100)}%` }} /></div><span>{offer?.model.name ?? event.offerId}</span><small>{formatDate(event.detectedAt)}</small></div>; })}</div>}<div className="chart-legend"><span><i className="legend-swatch mint" />Current known value</span><span><i className="legend-line" />No line is drawn before first observation</span></div></section><section className="event-list-card table-card"><div className="chart-heading"><div><span className="eyebrow">EVENT LOG</span><h2>Chronological record</h2></div><History size={19} /></div><div className="event-list">{visible.map((event) => { const offer = findOffer(offers, event.offerId); const current = event.currentPricing.find((rule) => rule.mode === 'standard'); return <article className="event-item" key={event.id}><div className="event-timeline"><span /><i /></div><div><div className="event-topline"><Badge tone="mint">Initial observation</Badge><span>{formatDate(event.detectedAt)}</span></div><h3>{offer?.model.name ?? event.offerId}</h3><p>{offer?.provider.name} · {current?.inputPrice === null || current?.inputPrice === undefined ? 'Input price not verified' : `${formatCurrency(current.inputPrice, 4)} input / 1M`}</p><a href={event.source.url} target="_blank" rel="noreferrer">Open official source <ExternalLink size={12} /></a><small>{event.notes}</small></div></article>; })}</div></section></div><div className="history-honesty"><ShieldCheck size={18} /><div><strong>What this history does not claim</strong><p>These are project detection events, not a complete reconstruction of provider pricing history. Before the first observation, the chart is intentionally blank. The next update will be a reviewed data change, not a silent overwrite.</p></div></div></>;
}

function ValuePage() {
  const { offers } = useCatalog();
  const [xAxis, setXAxis] = useState<string>('input');
  const [yAxis, setYAxis] = useState<'output' | 'context' | 'input'>('context');
  const [required, setRequired] = useState<string[]>([]);
  const [weights, setWeights] = useState({ cost: 40, context: 25, speed: 10, latency: 10, resources: 15 });
  const candidates = offers.filter((offer) => required.every((capability) => offer.model.capabilities[capability as keyof OfferView['model']['capabilities']] === true || (capability === 'image' && offer.model.modalities.input.includes('image'))));
  const getAxis = (offer: OfferView, axis: string) => { const rule = StandardRule({ offer }); if (axis === 'input') return rule?.inputPrice ?? null; if (axis === 'output') return rule?.outputPrice ?? null; if (axis === 'context') return offer.model.contextWindowTokens ?? null; return null; };
  const raw = candidates.map((offer) => ({ offer, x: getAxis(offer, xAxis), y: getAxis(offer, yAxis) })).filter((point): point is { offer: OfferView; x: number; y: number } => point.x !== null && point.y !== null);
  const xValues = raw.map((item) => item.x); const yValues = raw.map((item) => item.y); const xMin = Math.min(...xValues, 0); const xMax = Math.max(...xValues, 1); const yMin = Math.min(...yValues, 0); const yMax = Math.max(...yValues, 1);
  const points: ParetoPoint[] = raw.map((item) => ({ offer: item.offer, x: xAxis === 'context' ? -item.x : item.x, y: yAxis === 'input' || yAxis === 'output' ? -item.y : item.y, dominated: false }));
  const frontierIds = new Set(paretoFrontier(points).map((point) => point.offer.id));
  const rankings = scoreOffers(candidates, { cost: weights.cost, context: weights.context, speed: weights.speed, latency: weights.latency, resources: weights.resources }).slice(0, 8);
  const toggleRequired = (id: string) => setRequired((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const chartX = (value: number) => ((value - xMin) / Math.max(1, xMax - xMin)) * 92 + 4;
  const chartY = (value: number) => 96 - ((value - yMin) / Math.max(1, yMax - yMin)) * 88;
  return <><PageHeader eyebrow="DECISION SUPPORT / VALUE" title="Value is a frontier, not a winner." description="Plot two measurable dimensions, then inspect the non-dominated offers. Unknowns stay out of the frontier instead of receiving invented scores." actions={<Link className="button button-primary" to="/calculator">Simulate a workload <BarChart3 size={16} /></Link>} /><div className="value-controls table-card"><div className="axis-control"><label>X axis<select value={xAxis} onChange={(event) => setXAxis(event.target.value as typeof xAxis)}><option value="input">Input price</option><option value="monthly">Monthly simulated cost</option><option value="context">Context window</option></select></label><span className="axis-arrow">×</span><label>Y axis<select value={yAxis} onChange={(event) => setYAxis(event.target.value as typeof yAxis)}><option value="context">Context window</option><option value="output">Output price</option><option value="input">Input price</option></select></label></div><div className="value-filter-group"><span className="field-label">Required resources</span><div className="inline-checks">{['functionCalling', 'structuredOutputs', 'promptCaching', 'batchApi', 'reasoning', 'image'].map((capability) => <label key={capability}><input type="checkbox" checked={required.includes(capability)} onChange={() => toggleRequired(capability)} /><span className="fake-check"><Check size={12} /></span>{capability === 'functionCalling' ? 'Tools' : capability === 'structuredOutputs' ? 'JSON' : capability === 'promptCaching' ? 'Cache' : capability === 'batchApi' ? 'Batch' : capability === 'reasoning' ? 'Reasoning' : 'Vision'}</label>)}</div></div></div><div className="value-layout"><section className="scatter-card table-card"><div className="chart-heading"><div><span className="eyebrow">PARETO FRONTIER</span><h2>{raw.length} offers with known axes</h2></div><div className="frontier-legend"><span><i className="legend-swatch mint" />Non-dominated</span><span><i className="legend-swatch slate" />Other known</span></div></div><div className="scatter-wrap"><div className="axis-y-label">{yAxis === 'context' ? 'Context window' : yAxis === 'output' ? 'Output price' : 'Input price'}</div><svg viewBox="0 0 100 100" role="img" aria-label="Pareto frontier scatter plot" className="scatter-plot"><line x1="4" y1="96" x2="96" y2="96" className="axis-line" /><line x1="4" y1="8" x2="4" y2="96" className="axis-line" />{raw.map((point) => <g key={point.offer.id} className={frontierIds.has(point.offer.id) ? 'scatter-point frontier' : 'scatter-point'}><title>{point.offer.model.name} via {point.offer.provider.name}</title><circle cx={chartX(point.x)} cy={chartY(point.y)} r={frontierIds.has(point.offer.id) ? 1.8 : 1.2} /></g>)}</svg><div className="axis-x-label">{xAxis === 'context' ? 'Context window' : xAxis === 'output' ? 'Output price' : 'Input price'}</div></div><div className="scatter-note"><Lightbulb size={15} /><span>A frontier depends on the axes, constraints and workload. It does not identify an absolute “best model.”</span></div></section><section className="ranking-card table-card"><div className="chart-heading"><div><span className="eyebrow">OPTIONAL RANKING</span><h2>Transparent weights</h2></div><CircleHelp size={17} /></div><p className="ranking-intro">A small, inspectable score using only the fields below. It is a decision aid, not a measure of intelligence.</p><div className="weight-list">{(Object.keys(weights) as Array<keyof typeof weights>).map((key) => <label key={key}><span>{key}</span><input type="range" min="0" max="100" value={weights[key]} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} /><b>{weights[key]}</b></label>)}</div><div className="ranking-list">{rankings.map((item, index) => <div className="ranking-item" key={item.offer.id}><span className="ranking-index">{index + 1}</span><span><strong>{item.offer.model.name}</strong><small>{item.offer.provider.name} · {item.knownFields}/3 measurable fields</small></span><b>{item.score === null ? '—' : `${Math.round(item.score * 100)}%`}</b></div>)}</div></section></div></>;
}

function ModelPage() {
  const { modelId } = useParams();
  const { offers, catalog } = useCatalog();
  const modelOffers = offers.filter((offer) => offer.model.id === modelId);
  const model = modelOffers[0]?.model;
  if (!model) return <NotFoundPage />;
  const organization = modelOffers[0]?.organization;
  return <><PageHeader eyebrow="CATALOG / MODEL DETAIL" title={model.name} description={`${model.family ?? 'Model'} · ${organization?.name ?? 'Organization'} · canonical model across its commercial offers.`} actions={<><Link className="button button-ghost" to={`/compare?compare=${modelOffers.slice(0, 2).map((offer) => offer.id).join(',')}`}>Compare offers <ArrowDownUp size={16} /></Link><a className="button button-primary" href={`${GITHUB_URL}/edit/main/data/models/index.json`} target="_blank" rel="noreferrer">Edit data on GitHub <ExternalLink size={15} /></a></>} /><div className="model-hero-card"><div className="model-detail-mark">{model.name.slice(0, 1)}</div><div><div className="model-detail-top"><Badge tone={model.status === 'active' ? 'mint' : 'gold'}>{model.status}</Badge><StalenessBadge value={model.lastVerifiedAt} /></div><h2>{model.name}</h2><p>{model.modalities.input.join(', ')} input · {model.modalities.output.join(', ')} output</p></div><div className="model-hero-stats"><div><span>Context</span><strong>{formatCompactNumber(model.contextWindowTokens)}</strong></div><div><span>Max output</span><strong>{formatCompactNumber(model.maxOutputTokens)}</strong></div><div><span>Verified</span><strong>{formatDate(model.lastVerifiedAt)}</strong></div></div></div><div className="detail-grid"><section className="detail-card table-card"><div className="chart-heading"><div><span className="eyebrow">CAPABILITIES</span><h2>What is verified</h2></div><ShieldCheck size={18} /></div><div className="capability-detail-grid">{Object.entries(model.capabilities).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, ' $1')}</span><Capability value={value} /></div>)}</div></section><section className="detail-card table-card"><div className="chart-heading"><div><span className="eyebrow">COMMERCIAL OFFERS</span><h2>{modelOffers.length} provider{modelOffers.length === 1 ? '' : 's'}</h2></div><Table2 size={18} /></div><div className="offer-detail-list">{modelOffers.map((offer) => { const rule = StandardRule({ offer }); return <div key={offer.id} className="offer-detail-row"><div><strong>{offer.provider.name}</strong><small>{offer.apiModelId}</small></div><span><Price value={rule?.inputPrice} /><small>input / 1M</small></span><span><Price value={rule?.outputPrice} /><small>output / 1M</small></span><Link to={`/compare?compare=${offer.id}`} aria-label={`Compare ${offer.model.name} offer`}><ArrowRight size={16} /></Link></div>; })}</div></section><section className="detail-card table-card"><div className="chart-heading"><div><span className="eyebrow">SOURCES</span><h2>Official references</h2></div><BookOpen size={18} /></div><SourceList sources={modelOffers.flatMap((offer) => [...offer.sources, ...model.sources])} /></section><section className="detail-card table-card"><div className="chart-heading"><div><span className="eyebrow">HISTORY / BENCHMARKS</span><h2>Evidence status</h2></div><History size={18} /></div><p className="detail-copy">{catalog.history.filter((event) => modelOffers.some((offer) => offer.id === event.offerId)).length ? 'This model has a project observation in the price history.' : 'No historical price event has been recorded for this model yet.'}</p><p className="detail-copy">{catalog.benchmarks.filter((benchmark) => modelOffers.some((offer) => offer.id === benchmark.offerId)).length ? 'Reproducible observed performance is available.' : 'No reproducible benchmark is published yet. Performance values are intentionally not estimated.'}</p></section></div></>;
}

function MethodologyPage() {
  const { catalog } = useCatalog();
  return <><PageHeader eyebrow="REFERENCE / METHODOLOGY" title="A public method for a private bill." description="AI Cost Explorer makes the assumptions behind a comparison inspectable, versioned and easy to challenge." actions={<a className="button button-primary" href={`${GITHUB_URL}/blob/main/docs/methodology.md`} target="_blank" rel="noreferrer">Read on GitHub <ExternalLink size={15} /></a>} /><div className="methodology-layout"><aside className="methodology-nav"><a href="#entities">01 · Entities</a><a href="#pricing">02 · Pricing</a><a href="#history-method">03 · History</a><a href="#benchmarks">04 · Benchmarks</a><a href="#freshness">05 · Freshness</a><a href="#limits">06 · Limits</a></aside><article className="prose-card"><section id="entities"><div className="eyebrow">01 / ENTITY MODEL</div><h2>Model ≠ provider ≠ offer</h2><p>A model is the canonical capability surface. A provider is the API company or platform that serves it. An offer is where commercial terms live: a provider, an API model ID and one or more pricing rules.</p><div className="entity-flow"><span>MODEL<small>canonical model</small></span><ArrowRight size={17} /><span>PROVIDER<small>API surface</small></span><ArrowRight size={17} /><span className="highlight">OFFER<small>price + terms</small></span></div></section><section id="pricing"><div className="eyebrow">02 / TOKEN ECONOMICS</div><h2>Prices are rules, not labels.</h2><p>Each rule has a unit, mode, optional cache prices and optional token thresholds. The simulator subtracts cached and cache-write tokens from standard input so cached tokens are never billed twice.</p><div className="code-block"><code>standard input = max(0, input − cached − writes)<br />token cost = tokens / 1,000,000 × price<br />adjusted requests = base requests × (1 + retry rate)<br />monthly = request cost × requests/day × days/month</code></div><p>Batch is blended only across the chosen batch fraction. When a provider publishes a long-context threshold, the rule with the matching minimum or maximum input is selected. Missing prices produce “Not verified” and a warning.</p></section><section id="history-method"><div className="eyebrow">03 / AUDITABLE HISTORY</div><h2>Start where the project starts.</h2><p>The initial public beta includes project detection events dated {formatDate(catalog.dataAsOf)}. We do not draw a synthetic line before that point. A future update should include a reviewed diff with an official source and, when known, a separate effective date.</p></section><section id="benchmarks"><div className="eyebrow">04 / OBSERVED PERFORMANCE</div><h2>Benchmarks are evidence, not specification.</h2><p>Performance data is empty until it is measured under the documented protocol: two warmups, at least five measured repetitions, concurrency one for baseline, streaming for TTFT, P50/P95, region and UTC timestamp. CI never runs paid benchmarks automatically.</p><Link className="text-link" to="/methodology#limits">See current limitations <ArrowRight size={14} /></Link></section><section id="freshness"><div className="eyebrow">05 / FRESHNESS</div><h2>Staleness is a signal, not a deletion.</h2><div className="freshness-grid"><div><Badge tone="mint">Fresh</Badge><span>0–30 days</span></div><div><Badge tone="gold">Aging</Badge><span>31–60 days</span></div><div><Badge tone="danger">Stale</Badge><span>61+ days</span></div><div><Badge>Unknown</Badge><span>No reliable date</span></div></div></section><section id="limits"><div className="eyebrow">06 / LIMITATIONS</div><h2>What v0.1.0 does not pretend to know.</h2><ul className="method-list"><li>Provider pricing can change outside the weekly watch window.</li><li>“Not verified” is not a negative capability and should not be scored as one.</li><li>Output rates and context limits may vary by endpoint, region, tier or contract.</li><li>No performance benchmark is published in the beta dataset yet.</li><li>Currency conversion and downstream infrastructure costs are intentionally out of scope.</li></ul></section></article></div><div className="source-registry table-card"><div className="chart-heading"><div><span className="eyebrow">SOURCE REGISTRY</span><h2>{catalog.sources.length} official pages checked</h2></div><a href={`${GITHUB_URL}/tree/main/data/sources`} target="_blank" rel="noreferrer"><Github size={18} /></a></div><div className="source-registry-grid">{catalog.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span className="source-mark">↗</span><span><strong>{source.title}</strong><small>{source.publisher} · checked {formatDate(source.checkedAt)}</small></span><ExternalLink size={12} /></a>)}</div></div><p className="disclaimer">{DISCLAIMER}</p></>;
}

function NotFoundPage() { return <div className="not-found"><div className="eyebrow">404 / NOT FOUND</div><h1>That page wandered off.</h1><p>Try the explorer or return to the overview.</p><div><Link className="button button-primary" to="/">Go to overview <ArrowRight size={16} /></Link><Link className="button button-ghost" to="/explore">Explore models <Table2 size={16} /></Link></div></div>; }
