import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { FrontierChart, HistoryTimeline, type FrontierPoint } from './charts';
import catalogJson from '../../public/data/catalog-v1.json';
import { hydrateOffers } from '../lib/catalog';
import { paretoFrontier } from '../lib/pareto';
import { standardRule } from '../lib/pricing';
import type { Catalog } from '../types';

const catalog = catalogJson as unknown as Catalog;
const offers = hydrateOffers(catalog);

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => catalog })),
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(cleanup);

const renderTimeline = () =>
  render(
    <MemoryRouter>
      <HistoryTimeline events={catalog.history} offers={offers} endDate={catalog.dataAsOf} />
    </MemoryRouter>,
  );
const laneFor = (container: HTMLElement, model: string, provider: string) =>
  [...container.querySelectorAll<HTMLElement>('.timeline-lane')].find(
    (lane) =>
      lane.querySelector('.lane-label a')?.textContent === model &&
      lane.querySelector('.lane-label small')?.textContent?.startsWith(provider),
  )!;

describe('HistoryTimeline', () => {
  test('draws one lane per observed offer', () => {
    const { container } = renderTimeline();
    const observedOffers = new Set(catalog.history.map((event) => event.offerId));
    expect(container.querySelectorAll('.timeline-lane')).toHaveLength(observedOffers.size);
    expect(container.querySelectorAll('.lane-dot')).toHaveLength(catalog.history.length);
  });

  test('ends a retired offer at its retirement instead of carrying the price forward', () => {
    const { container } = renderTimeline();
    const lane = laneFor(container, 'DeepSeek V4 Flash', 'DeepSeek API');
    expect(lane.querySelector('.lane-dot.retirement')).not.toBeNull();
    const retirement = lane.querySelector<HTMLElement>('.lane-dot.retirement')!;
    const carries = [...lane.querySelectorAll<HTMLElement>('.lane-carry')];
    expect(carries).toHaveLength(1);
    const carryEnd = parseFloat(carries[0].style.left) + parseFloat(carries[0].style.width);
    expect(carryEnd).toBeCloseTo(parseFloat(retirement.style.left), 5);
  });

  test('never draws before an offer is first observed', () => {
    const { container } = renderTimeline();
    for (const lane of container.querySelectorAll<HTMLElement>('.timeline-lane')) {
      const first = Math.min(
        ...[...lane.querySelectorAll<HTMLElement>('.lane-dot')].map((dot) =>
          parseFloat(dot.style.left),
        ),
      );
      for (const carry of lane.querySelectorAll<HTMLElement>('.lane-carry'))
        expect(parseFloat(carry.style.left)).toBeGreaterThanOrEqual(first);
    }
  });

  test('labels time-of-day tariffs as the peak rate and marks the direction of a change', () => {
    const { container } = renderTimeline();
    const lane = laneFor(container, 'DeepSeek V4 Pro', 'DeepSeek API');
    const dot = lane.querySelector<HTMLElement>('.lane-dot.price-change')!;
    expect(dot.classList.contains('up')).toBe(true);
    expect(dot.textContent).toContain('$1.32 peak');
  });
});

describe('FrontierChart', () => {
  const points: FrontierPoint[] = offers
    .filter((offer) => offer.availability.status !== 'retired')
    .flatMap((offer) => {
      const x = standardRule({ offer })?.inputPrice;
      const y = offer.model.contextWindowTokens;
      return x == null || y == null ? [] : [{ offer, x, y }];
    });
  const frontierIds = new Set(
    paretoFrontier(points.map((point) => ({ ...point, dominated: false }))).map(
      (point) => point.offer.id,
    ),
  );
  const renderChart = (scale: 'log' | 'linear') =>
    render(
      <MemoryRouter>
        <FrontierChart
          points={points}
          frontierIds={frontierIds}
          xAxis="input"
          yAxis="context"
          scale={scale}
        />
      </MemoryRouter>,
    );

  test('labels log axes by decade and draws the non-dominated staircase', () => {
    const { container } = renderChart('log');
    const xTicks = [...container.querySelectorAll('.tick-x b')].map((tick) => tick.textContent);
    const yTicks = [...container.querySelectorAll('.tick-y b')].map((tick) => tick.textContent);
    expect(xTicks).toEqual(expect.arrayContaining(['$0.01', '$0.1', '$1', '$10']));
    expect(yTicks).toEqual(expect.arrayContaining(['1K', '10K', '100K', '1M']));
    expect(container.querySelectorAll('.frontier-dot')).toHaveLength(points.length);
    expect(container.querySelectorAll('.frontier-dot.on')).toHaveLength(frontierIds.size);
    expect(container.querySelector('.frontier-line path')?.getAttribute('d')).toMatch(/^M .* L /);
  });

  test('uses zero-based ticks on the linear scale', () => {
    const { container } = renderChart('linear');
    const xTicks = [...container.querySelectorAll('.tick-x b')].map((tick) => tick.textContent);
    expect(xTicks[0]).toBe('$0');
  });

  test('shows values in a tooltip on keyboard focus and explains the log floor', () => {
    renderChart('log');
    const free = points.find((point) => point.x === 0);
    expect(free).toBeDefined();
    const dot = screen.getByRole('link', { name: new RegExp(`^${free!.offer.model.name} via`) });
    fireEvent.focus(dot);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText(free!.offer.model.name)).toBeTruthy();
    expect(tip.textContent).toContain('$0.01 floor');
    fireEvent.blur(dot);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

test('explorer pages the card list and resets when filters change', async () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/explore']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Explore AI models' });
  const cards = () =>
    container.querySelectorAll('.explorer-mobile-list .explorer-offer-card').length;
  expect(cards()).toBe(20);
  fireEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
  expect(cards()).toBe(40);
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  const total = container.querySelectorAll('.explorer-table tbody tr').length;
  expect(cards()).toBe(total);
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Search model, provider or API ID'), {
    target: { value: 'G' },
  });
  expect(cards()).toBeLessThanOrEqual(20);
}, 30_000); // renders the whole app with every offer twice (table and cards)
