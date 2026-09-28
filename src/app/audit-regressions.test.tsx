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
const workloadFields = () =>
  screen.getAllByRole('spinbutton').map((field) => (field as HTMLInputElement).value);
const presetCard = (name: RegExp) => screen.getByRole('button', { name });

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

test('the default workload matches the highlighted preset, including after reset', async () => {
  render(
    <MemoryRouter initialEntries={['/calculator']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  const support = presetCard(/Customer support chatbot/);
  expect(support.className).toContain('active');
  const defaultWorkload = workloadFields();
  // Promotional material quotes this exact opening workload.
  expect(defaultWorkload).toEqual(['1800', '420', '900', '0', '50000', '30', '3', '0']);
  fireEvent.click(support);
  expect(workloadFields()).toEqual(defaultWorkload);

  fireEvent.change(screen.getByLabelText(/Requests \/ day/), { target: { value: '999' } });
  expect(support.className).not.toContain('active');
  fireEvent.click(screen.getByText('Saved workloads · 0'));
  fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));
  expect(support.className).toContain('active');
  expect(workloadFields()).toEqual(defaultWorkload);
});

test('offers-only links preselect exactly those offers on the default workload', async () => {
  const defaults = render(
    <MemoryRouter initialEntries={['/calculator']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  const defaultWorkload = workloadFields();
  defaults.unmount();

  const { container } = render(
    <MemoryRouter
      initialEntries={['/calculator?offers=offer-openai-gpt-6-sol,offer-mistral-large-3']}
    >
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Inference subtotal by offer' });
  const checked = screen
    .getAllByRole('checkbox', { checked: true })
    .map((box) => box.closest('.offer-pick-row')?.querySelector('strong')?.textContent);
  expect(checked.sort()).toEqual(['GPT-6 Sol', 'Mistral Large 3']);
  const cards = [...container.querySelectorAll('.result-card')].map(
    (card) => card.querySelector('.result-model')?.textContent,
  );
  expect(cards.sort()).toEqual(['GPT-6 Sol', 'Mistral Large 3']);
  expect(presetCard(/Customer support chatbot/).className).toContain('active');
  expect(presetCard(/Custom workload/).className).not.toContain('active');
  expect(workloadFields()).toEqual(defaultWorkload);
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
