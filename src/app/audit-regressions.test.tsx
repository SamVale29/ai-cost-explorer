import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import catalog from '../../public/data/catalog-v1.json';

beforeAll(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => catalog })),
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
const shared =
  '/calculator?in=1000&out=200&cache=0&write=0&req=1000&days=30&retry=0&batch=0&users=10&convos=2&messages=3&offers=offer-cohere-command-r7b&mode=monthly';

// Re-selecting the highlighted preset applies its workload; no field or subtotal may move.
function expectHighlightedPresetInFields(container: HTMLElement) {
  const workload = () => [
    ...[...container.querySelectorAll<HTMLInputElement>('.number-field input')].map(
      (field) => field.value,
    ),
    ...[...container.querySelectorAll('.result-price')].map((price) => price.textContent),
  ];
  const before = workload();
  expect(before.length).toBeGreaterThan(8);
  fireEvent.click(container.querySelector('.preset-card.active')!);
  expect(workload()).toEqual(before);
}

test('legacy shares show actual volume and edits immediately change the estimate', async () => {
  const { container } = render(
    <MemoryRouter initialEntries={[shared]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Estimate the bill before it arrives.' });
  const requests = screen.getByLabelText(/Requests \/ day/) as HTMLInputElement;
  expect(requests.value).toBe('60');
  const before = container.querySelector('.result-price')!.textContent;
  fireEvent.change(requests, { target: { value: '999' } });
  expect(requests.value).toBe('999');
  expect(container.querySelector('.result-price')!.textContent).not.toBe(before);
  expect(screen.getByRole('button', { name: 'monthly' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'annual' }));
  expect(screen.getByRole('button', { name: 'annual' }).getAttribute('aria-pressed')).toBe('true');
});

test('first load fills the fields with the highlighted preset workload', async () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/calculator']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  expect(container.querySelector('.preset-card.active')!.textContent).toContain(
    'Customer support chatbot',
  );
  const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;
  expect(value(/Input tokens \/ request/)).toBe('1800');
  expect(value(/Output tokens \/ request/)).toBe('420');
  expect(value(/Cached input tokens/)).toBe('900');
  expect(value(/Requests \/ day/)).toBe('50000');
  expectHighlightedPresetInFields(container);
});

test('reset returns to the highlighted preset workload', async () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/calculator']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  fireEvent.change(screen.getByLabelText(/Requests \/ day/), { target: { value: '7' } });
  expect(container.querySelector('.preset-card.active')!.textContent).toContain('Custom workload');
  fireEvent.click(screen.getByText('Saved workloads · 0'));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(container.querySelector('.preset-card.active')!.textContent).toContain(
    'Customer support chatbot',
  );
  expectHighlightedPresetInFields(container);
});

test('storage rejection is visible and still permits session export', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  render(
    <MemoryRouter initialEntries={['/calculator']}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Saved workloads · 0'));
  await screen.findByLabelText('Scenario name');
  fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Audit scenario' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save current' }));
  expect(screen.getByRole('status').textContent).toContain('session only');
  expect(screen.getByRole('status').textContent).not.toContain('Saved');
  expect(localStorage.getItem('ai-cost-explorer-scenarios')).toBeNull();
});

test('retired selections stay explanatory and never receive a recommendation', async () => {
  const url = shared.replace('offer-cohere-command-r7b', 'offer-together-qwen-3-5-397b');
  const { container } = render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  expect(container.querySelector('.result-price')!.textContent).toBe('Retired');
  expect(container.querySelector('.result-card.best')).toBeNull();
  expect(screen.getByText(/Retired — historical selection/)).toBeTruthy();
});

test('history distinguishes observed changes and retirement', async () => {
  render(
    <MemoryRouter initialEntries={['/history']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Chronological record' });
  expect(screen.getAllByText('Initial observation')).toHaveLength(
    catalog.history.filter((event) => event.eventType === 'initial').length,
  );
  expect(screen.getAllByText('Price change').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Offer retired').length).toBeGreaterThan(0);
});

test('model details disclose account eligibility and independent verification dates', async () => {
  render(
    <MemoryRouter initialEntries={['/model/gemini-2-5-flash']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Gemini 2.5 Flash', level: 1 });
  expect(screen.getByText('Existing users only')).toBeTruthy();
  expect(
    screen.getByText(/availability is limited to accounts that used the family before/i),
  ).toBeTruthy();
  expect(screen.getByText(/Pricing checked/)).toBeTruthy();
  expect(screen.getByText(/availability checked/)).toBeTruthy();
});

test('retired model detail marks its rate as historical and links the replacement', async () => {
  render(
    <MemoryRouter initialEntries={['/model/deepseek-v4-flash']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'DeepSeek V4 Flash', level: 1 });
  expect(screen.getByText('Historical · $0.14')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Replaced by DeepSeek V4.1 Flash' })).toBeTruthy();
});
