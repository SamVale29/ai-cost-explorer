import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { findOffer } from '../lib/catalog';
import { formatCompactNumber, formatDate, formatUnitPrice } from '../lib/format';
import { historyEventLabel, historyPriceChanges } from '../lib/history';
import type { OfferView, PriceChangeEvent, PricingRule } from '../types';

/* ---------------------------------------------------------------------------------------------
 * Price history timeline
 * One lane per offer. Dots are dated project observations; the dashed segment after a dot is the
 * last known value carried forward until the next check. Nothing is drawn before an offer's first
 * observation, and a retired offer's lane ends at its retirement.
 * ------------------------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const civilDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
function headlineInput(rules: PricingRule[]): { price: number | null; peak: boolean } {
  const standard = rules.find((rule) => rule.mode === 'standard' && !rule.minimumInputTokens);
  if (standard) return { price: standard.inputPrice ?? null, peak: false };
  const peak = rules.find((rule) => rule.mode === 'peak' && !rule.minimumInputTokens);
  return { price: peak?.inputPrice ?? null, peak: Boolean(peak) };
}
const shortDay = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms);

type TimelinePoint = {
  event: PriceChangeEvent;
  at: number;
  price: number | null;
  peak: boolean;
  kind: 'initial' | 'price-change' | 'retirement';
  trend: 'down' | 'up' | 'same' | null;
};

export function HistoryTimeline({
  events,
  offers,
  endDate,
}: {
  events: PriceChangeEvent[];
  offers: OfferView[];
  endDate: string;
}) {
  const grouped = new Map<string, PriceChangeEvent[]>();
  for (const event of events)
    grouped.set(event.offerId, [...(grouped.get(event.offerId) ?? []), event]);
  const lanes = [...grouped]
    .flatMap(([offerId, list]) => {
      const offer = findOffer(offers, offerId);
      if (!offer) return [];
      let previous: number | null = null;
      const points: TimelinePoint[] = [...list]
        .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
        .map((event) => {
          const kind =
            event.eventType ?? (event.previousPricing.length ? 'price-change' : 'initial');
          const { price, peak } = headlineInput(event.currentPricing);
          const before = previous ?? headlineInput(event.previousPricing).price;
          const trend =
            kind === 'price-change' && price !== null && before !== null
              ? price < before
                ? 'down'
                : price > before
                  ? 'up'
                  : 'same'
              : null;
          if (price !== null) previous = price;
          return { event, at: civilDay(event.detectedAt), price, peak, kind, trend };
        });
      return [{ offer, points }];
    })
    .sort(
      (a, b) =>
        a.points[0].at - b.points[0].at || a.offer.model.name.localeCompare(b.offer.model.name),
    );
  if (!lanes.length) return null;

  const start = Math.min(...lanes.map((lane) => lane.points[0].at));
  const end = Math.max(
    civilDay(endDate),
    ...lanes.flatMap((lane) => lane.points.map((point) => point.at)),
  );
  const span = Math.max(DAY_MS, end - start);
  const pos = (at: number) => ((at - start) / span) * 100;
  const monthTicks: number[] = [];
  for (let tick = new Date(start); ;) {
    tick = new Date(Date.UTC(tick.getUTCFullYear(), tick.getUTCMonth() + 1, 1));
    if (tick.getTime() >= end) break;
    monthTicks.push(tick.getTime());
  }

  return (
    <div className="timeline">
      <div className="timeline-lanes" role="list" aria-label="Observed input prices by offer">
        <div className="timeline-grid" aria-hidden="true">
          {monthTicks.map((tick) => (
            <i key={tick} style={{ left: `${pos(tick)}%` }} />
          ))}
        </div>
        {lanes.map(({ offer, points }) => (
          <div className="timeline-lane" role="listitem" key={offer.id}>
            <div className="lane-label">
              <Link to={`/model/${offer.model.id}`}>{offer.model.name}</Link>
              <small>
                {offer.provider.name}
                {offer.availability.status === 'retired' ? ' · retired' : ''}
              </small>
            </div>
            <div className="lane-track">
              {points.map((point, index) => {
                if (point.kind === 'retirement') return null;
                const next = points[index + 1];
                const from = pos(point.at);
                const to = pos(next ? next.at : end);
                return to > from ? (
                  <span
                    key={`carry-${point.event.id}`}
                    className="lane-carry"
                    style={{ left: `${from}%`, width: `${to - from}%` }}
                  />
                ) : null;
              })}
              {points.map((point, index) => {
                const crowded = index > 0 && pos(point.at) - pos(points[index - 1].at) < 14;
                const description = `${historyEventLabel(point.event)}, ${formatDate(point.event.detectedAt)}: ${historyPriceChanges(point.event).join('; ')}`;
                return (
                  <span
                    key={point.event.id}
                    className={`lane-dot ${point.kind}${point.trend ? ` ${point.trend}` : ''}`}
                    style={{ left: `${pos(point.at)}%` }}
                    role="img"
                    aria-label={description}
                    title={description}
                  >
                    {point.kind === 'retirement' && <X size={9} strokeWidth={3} />}
                    <span className={`lane-price${crowded ? ' below' : ''}`}>
                      {point.trend === 'down' && <ArrowDown size={11} strokeWidth={2.6} />}
                      {point.trend === 'up' && <ArrowUp size={11} strokeWidth={2.6} />}
                      {point.kind === 'retirement'
                        ? 'retired'
                        : point.price === null
                          ? '—'
                          : `${formatUnitPrice(point.price)}${point.peak ? ' peak' : ''}`}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="timeline-axis" aria-hidden="true">
        <span className="start" style={{ left: '0%' }}>
          {shortDay(start)}
          <span className="axis-year">, {new Date(start).getUTCFullYear()}</span>
        </span>
        {monthTicks.map((tick) => (
          <span key={tick} style={{ left: `${pos(tick)}%` }}>
            {shortDay(tick)}
          </span>
        ))}
        <span className="end" style={{ left: '100%' }}>
          {shortDay(end)} · catalog
        </span>
      </div>
      <div className="timeline-legend">
        <span>
          <i className="legend-dot initial" />
          First observation
        </span>
        <span>
          <i className="legend-dot down" />
          Lower price
        </span>
        <span>
          <i className="legend-dot up" />
          Higher price
        </span>
        <span>
          <i className="legend-dot same" />
          Rules updated
        </span>
        <span>
          <i className="legend-dot retirement" />
          Retired
        </span>
        <span>
          <i className="legend-carry" />
          Last known value until the next check · nothing before the first observation
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Value frontier scatter
 * Points are real links to the model page (focusable, keyboard reachable); the non-dominated
 * staircase is drawn in an SVG overlay. Log scale is the default because prices and context
 * windows both span several orders of magnitude.
 * ------------------------------------------------------------------------------------------- */

export type AxisKey = 'input' | 'output' | 'context';
export type FrontierPoint = { offer: OfferView; x: number; y: number };

const AXIS_TITLE: Record<AxisKey, string> = {
  input: 'Input price · USD / 1M',
  output: 'Output price · USD / 1M',
  context: 'Context window · tokens',
};
const AXIS_NAME: Record<AxisKey, string> = {
  input: 'Input',
  output: 'Output',
  context: 'Context',
};
const PRICE_FLOOR = 0.01;

export function AxisTitle({ axis }: { axis: AxisKey }) {
  return <>{AXIS_TITLE[axis]}</>;
}

// Larger context is better; lower prices are better.
const better = (axis: AxisKey) => (axis === 'context' ? 1 : -1);

function formatTick(axis: AxisKey, value: number) {
  if (axis === 'context') return formatCompactNumber(value);
  if (value === 0) return '$0';
  return `$${Number(value.toPrecision(3))}`;
}

function formatValue(axis: AxisKey, value: number) {
  return axis === 'context'
    ? `${formatCompactNumber(value)} tokens`
    : `${formatUnitPrice(value)} / 1M`;
}

function niceStep(max: number) {
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function FrontierChart({
  points,
  frontierIds,
  xAxis,
  yAxis,
  scale,
}: {
  points: FrontierPoint[];
  frontierIds: Set<string>;
  xAxis: AxisKey;
  yAxis: AxisKey;
  scale: 'log' | 'linear';
}) {
  const [active, setActive] = useState<string | null>(null);
  if (!points.length) return null;

  const floorFor = (axis: AxisKey) => (axis === 'context' ? 1 : PRICE_FLOOR);
  const toScale = (axis: AxisKey, value: number) =>
    scale === 'log' ? Math.log10(Math.max(value, floorFor(axis))) : value;
  const buildAxis = (axis: AxisKey, values: number[]) => {
    if (scale === 'log') {
      // Tight bounds with a small margin; ticks only at the decades that fall inside.
      const scaled = values.map((value) => toScale(axis, value));
      const min = Math.min(...scaled);
      const max = Math.max(...scaled);
      const pad = Math.max(0.08, (max - min) * 0.05);
      const lo = min - pad;
      const hi = max + pad;
      const ticks: number[] = [];
      for (let exponent = Math.ceil(lo); exponent <= Math.floor(hi); exponent++)
        ticks.push(10 ** exponent);
      if (!ticks.length) ticks.push(10 ** Math.round(min));
      return { lo, hi, ticks };
    }
    const max = Math.max(...values, 0) || 1;
    const step = niceStep(max);
    const hi = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let value = 0; value <= hi + step / 2; value += step)
      ticks.push(Number(value.toPrecision(6)));
    return { lo: 0, hi, ticks };
  };
  const xScale = buildAxis(
    xAxis,
    points.map((point) => point.x),
  );
  const yScale = buildAxis(
    yAxis,
    points.map((point) => point.y),
  );
  const px = (value: number) =>
    ((toScale(xAxis, value) - xScale.lo) / (xScale.hi - xScale.lo)) * 100;
  const py = (value: number) =>
    100 - ((toScale(yAxis, value) - yScale.lo) / (yScale.hi - yScale.lo)) * 100;

  // Staircase through the non-dominated points: each step turns at the corner dominated by both.
  const front = points
    .filter((point) => frontierIds.has(point.offer.id))
    .sort((a, b) => px(a.x) - px(b.x) || py(a.y) - py(b.y));
  const covers = (q: FrontierPoint, c: { x: number; y: number }) =>
    better(xAxis) * q.x >= better(xAxis) * c.x && better(yAxis) * q.y >= better(yAxis) * c.y;
  const path = front
    .map((point, index) => {
      if (index === 0) return `M ${px(point.x)} ${py(point.y)}`;
      const prev = front[index - 1];
      const corners = [
        { x: point.x, y: prev.y },
        { x: prev.x, y: point.y },
      ];
      const corner = corners.find((c) => covers(prev, c) && covers(point, c)) ?? corners[0];
      return `L ${px(corner.x)} ${py(corner.y)} L ${px(point.x)} ${py(point.y)}`;
    })
    .join(' ');

  const activePoint = points.find((point) => point.offer.id === active);
  const describe = (point: FrontierPoint) =>
    `${point.offer.model.name} via ${point.offer.provider.name}: ${AXIS_NAME[xAxis]} ${formatValue(xAxis, point.x)}, ${AXIS_NAME[yAxis]} ${formatValue(yAxis, point.y)}${frontierIds.has(point.offer.id) ? ', non-dominated' : ''}`;

  return (
    <div className="frontier-chart">
      <div className="frontier-plot">
        {xScale.ticks.map((tick) => (
          <span key={`x${tick}`} className="tick-x" style={{ left: `${px(tick)}%` }}>
            <i />
            <b>{formatTick(xAxis, tick)}</b>
          </span>
        ))}
        {yScale.ticks.map((tick) => (
          <span key={`y${tick}`} className="tick-y" style={{ top: `${py(tick)}%` }}>
            <i />
            <b>{formatTick(yAxis, tick)}</b>
          </span>
        ))}
        {front.length > 1 && (
          <svg
            className="frontier-line"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={path} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {points.map((point) => {
          const on = frontierIds.has(point.offer.id);
          return (
            <Link
              key={point.offer.id}
              to={`/model/${point.offer.model.id}`}
              className={`frontier-dot${on ? ' on' : ''}${active === point.offer.id ? ' active' : ''}`}
              style={{ left: `${px(point.x)}%`, top: `${py(point.y)}%` }}
              aria-label={describe(point)}
              onMouseEnter={() => setActive(point.offer.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(point.offer.id)}
              onBlur={() => setActive(null)}
            />
          );
        })}
        {front.map((point) => (
          <span
            key={`label-${point.offer.id}`}
            className={`frontier-label${px(point.x) > 70 ? ' left' : ''}`}
            style={{ left: `${px(point.x)}%`, top: `${py(point.y)}%` }}
            aria-hidden="true"
          >
            {point.offer.model.name}
          </span>
        ))}
        {activePoint && (
          <div
            className={`frontier-tip${px(activePoint.x) > 62 ? ' flip-x' : ''}${py(activePoint.y) < 28 ? ' flip-y' : ''}`}
            style={{ left: `${px(activePoint.x)}%`, top: `${py(activePoint.y)}%` }}
            role="tooltip"
          >
            <strong>{activePoint.offer.model.name}</strong>
            <span>{activePoint.offer.provider.name}</span>
            <dl>
              <dt>{AXIS_NAME[xAxis]}</dt>
              <dd>{formatValue(xAxis, activePoint.x)}</dd>
              <dt>{AXIS_NAME[yAxis]}</dt>
              <dd>{formatValue(yAxis, activePoint.y)}</dd>
            </dl>
            {frontierIds.has(activePoint.offer.id) && <em>Non-dominated</em>}
            {scale === 'log' &&
              ((xAxis !== 'context' && activePoint.x < PRICE_FLOOR) ||
                (yAxis !== 'context' && activePoint.y < PRICE_FLOOR)) && (
                <small>Plotted at the $0.01 floor of the log scale.</small>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
