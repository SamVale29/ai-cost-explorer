import type { ReactNode } from 'react';
import { Check, ExternalLink, Search } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { type CatalogHealth } from '../lib/catalog-health';
import { formatCurrency, formatDate, getStaleness, stalenessLabel } from '../lib/format';
import type { OfferView } from '../types';
import { GITHUB_URL } from './config';

export function ShellNavLink({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
      {label === 'Model explorer' && <span className="nav-count">40+</span>}
    </NavLink>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  accent = 'mint',
  icon,
}: {
  label: string;
  value: string;
  note: string;
  accent?: 'mint' | 'gold' | 'blue' | 'purple';
  icon: ReactNode;
}) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'mint' | 'gold' | 'blue' | 'danger' | 'purple';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Capability({ value }: { value: boolean | null | undefined }) {
  if (value === true)
    return (
      <span className="capability yes">
        <Check size={13} />
        Yes
      </span>
    );
  if (value === false) return <span className="capability no">No</span>;
  return (
    <span className="capability unknown" title="Not verified">
      â€”
    </span>
  );
}

export function StalenessBadge({ value }: { value: string | null | undefined }) {
  const staleness = getStaleness(value);
  const tone =
    staleness === 'fresh'
      ? 'mint'
      : staleness === 'aging'
        ? 'gold'
        : staleness === 'stale'
          ? 'danger'
          : 'neutral';
  return (
    <Badge tone={tone}>
      <span className={`staleness-dot ${staleness}`} />
      {stalenessLabel(staleness)}
    </Badge>
  );
}

export function Price({
  value,
  suffix = '',
}: {
  value: number | null | undefined;
  suffix?: string;
}) {
  return (
    <span className={value === null || value === undefined ? 'unknown-value' : ''}>
      {value === null || value === undefined
        ? 'Not verified'
        : `${formatCurrency(value, value < 0.01 ? 4 : 2)}${suffix}`}
    </span>
  );
}

export function SourceList({
  sources,
  compact = false,
}: {
  sources: OfferView['sources'];
  compact?: boolean;
}) {
  const unique = [...new Map(sources.map((source) => [source.url, source])).values()];
  return (
    <div className={`source-list ${compact ? 'source-list-compact' : ''}`}>
      {unique.map((source) => (
        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
          <span className="source-mark">â†—</span>
          <span>{source.title}</span>
          <ExternalLink size={12} />
        </a>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Search size={22} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function CatalogHealthPanel({ health }: { health: CatalogHealth }) {
  return (
    <section className="catalog-health-panel table-card" aria-labelledby="catalog-health-title">
      <div className="catalog-health-heading">
        <div>
          <span className="eyebrow">CATALOG HEALTH</span>
          <h2 id="catalog-health-title">Coverage you can inspect.</h2>
          <p>
            Percentages describe known fields in the reviewed public snapshot, not provider quality.
          </p>
        </div>
        <a
          className="text-link"
          href={`${GITHUB_URL}/blob/main/public/data/catalog-health-v1.json`}
          target="_blank"
          rel="noreferrer"
        >
          Open report <ExternalLink size={13} />
        </a>
      </div>
      <div className="catalog-health-grid">
        <div>
          <strong>{health.coverage.offersWithStandardInputPrice}%</strong>
          <span>Offers with input price</span>
        </div>
        <div>
          <strong>{health.coverage.offersWithStandardOutputPrice}%</strong>
          <span>Offers with output price</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithContextWindow}%</strong>
          <span>Models with context</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithVerifiedCapability}%</strong>
          <span>Models with a verified capability</span>
        </div>
      </div>
      <div className="catalog-health-footer">
        <span>
          {health.freshness.freshSources}/{health.totals.sources} sources fresh as of{' '}
          {formatDate(health.dataAsOf)}
        </span>
        <Badge tone={health.benchmarkStatus === 'empty' ? 'gold' : 'mint'}>
          {health.benchmarkStatus === 'empty'
            ? 'Benchmarks empty by design'
            : 'Benchmarks available'}
        </Badge>
      </div>
    </section>
  );
}
