import type { ReactNode } from 'react';
import { Check, ExternalLink, Search } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { type CatalogHealth } from '../lib/catalog-health';
import { formatDate, formatUnitPrice, getStaleness, stalenessLabel } from '../lib/format';
import type { OfferView } from '../types';
import { GITHUB_URL } from './config';

export function ShellNavLink({
  to,
  icon,
  label,
  end,
  count,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  count?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span className="nav-count" aria-label={`${count} currently active offers`}>
          {count}
        </span>
      )}
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
      —
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
  priceStatus,
  historical = false,
  unavailableLabel: explicitUnavailableLabel,
}: {
  value: number | null | undefined;
  suffix?: string;
  priceStatus?: 'public' | 'contact-sales' | 'not-published' | 'unit-unsupported';
  historical?: boolean;
  unavailableLabel?: string;
}) {
  const unavailableLabel =
    priceStatus === 'contact-sales'
      ? 'Contact sales'
      : priceStatus === 'not-published'
        ? 'Not published'
        : priceStatus === 'unit-unsupported'
          ? 'Unit not supported'
          : 'Not verified';
  return (
    <span
      className={`${value === null || value === undefined ? 'unknown-value' : ''}${historical ? ' historical-price' : ''}`}
      title={historical ? 'Historical price; this offer is retired.' : undefined}
    >
      {value === null || value === undefined
        ? (explicitUnavailableLabel ?? unavailableLabel)
        : `${historical ? 'Historical · ' : ''}${formatUnitPrice(value)}${suffix}`}
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
          <span className="source-mark">↗</span>
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
            Percentages describe listed fields and published price evidence in the dated public
            snapshot. A listed capability is not a claim that every capability was independently
            re-tested.
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
          <strong>{health.coverage.offersWithPublicStandardPrices}%</strong>
          <span>Offers with public input and output rates</span>
        </div>
        <div>
          <strong>{health.coverage.offersWithPriceSources}%</strong>
          <span>Offers with a dated source for standard pricing</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithContextWindow}%</strong>
          <span>Models with context</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithMaxOutput}%</strong>
          <span>Models with a published output limit</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithCapabilitiesListed}%</strong>
          <span>Models with at least one capability listed</span>
        </div>
        <div>
          <strong>{health.coverage.modelsWithFieldEvidence}%</strong>
          <span>Models with field-to-source evidence maps</span>
        </div>
      </div>
      <div className="catalog-health-footer">
        <span>
          Source snapshot as of {formatDate(health.dataAsOf)}
          {health.snapshotAgeDays !== null && ` · ${health.snapshotAgeDays} days old`}
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
