import type { OfferView, Staleness } from '../types';

export const numberFormat = new Intl.NumberFormat('en-US');
export const currencyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Not verified';
  const minimumFractionDigits = value !== 0 && value < 0.01 ? Math.min(6, digits + 4) : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits: Math.max(digits, minimumFractionDigits),
  }).format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Not verified';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Not verified';
  return `${formatCompactNumber(value)} tokens`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not verified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not verified';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getStaleness(value: string | null | undefined, now = new Date()): Staleness {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const ageDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (ageDays < 0) return 'unknown';
  if (ageDays <= 30) return 'fresh';
  if (ageDays <= 60) return 'aging';
  return 'stale';
}

export function stalenessLabel(value: Staleness): string {
  return value === 'fresh'
    ? 'Fresh'
    : value === 'aging'
      ? 'Aging'
      : value === 'stale'
        ? 'Stale'
        : 'Unknown';
}

export function primaryPricing(offer: OfferView) {
  return offer.pricing.find((rule) => rule.mode === 'standard') ?? offer.pricing[0];
}

export function valueOrDash(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function downloadText(filename: string, contents: string, type = 'text/plain') {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const stringValue = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}
