import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import HomeEditRoute from '@/app/home-edit';
import { defaultSettings } from '@/data/defaults';
import { usePro } from '@/lib/pro';

import { recurring, renderWithRepo } from '../../../../test-support/render';
import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { defaultHomeLayout } from '../layout';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/features/edit', () => require('../../../../test-support/edit-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: jest.fn() }));

beforeEach(() => {
  resetRouterMock();
  (usePro as jest.Mock).mockReturnValue({ isPro: false, loading: false });
});

const settings = { ...defaultSettings(), onboarded: true, startingBalance: 650000 };
const seed = { settings, recurring: [recurring({ id: 'r', name: 'Rent', kind: 'cost', amount: 950000 })] };
const open = () => renderWithRepo(<HomeEditRoute />, seed);
const saved = async (repo: { getSettings: () => Promise<{ homeLayout: { id: string; visible: boolean }[] }> }) => (await repo.getSettings()).homeLayout;

describe('Edit Home', () => {
  it('lists every card with its switch, in the saved order, year table and month-end list hidden', async () => {
    await open();
    expect(await screen.findByTestId('home-edit-screen')).toBeTruthy();
    for (const e of defaultHomeLayout()) {
      const toggle = screen.getByTestId(`home-edit-toggle-${e.id}`);
      expect(toggle.props.value).toBe(e.visible);
    }
    expect(screen.getByLabelText('Show Year table on Home')).toBeTruthy();
    // Nothing to move above the first card or below the last.
    expect(screen.getByTestId('home-edit-up-balance').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('home-edit-down-backup').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('home-edit-reset').props.accessibilityState.disabled).toBe(true);
  });

  it('hides and shows a card and saves it at once', async () => {
    const { repo } = await open();
    await fireEvent(await screen.findByTestId('home-edit-toggle-payday'), 'valueChange', false);
    await waitFor(async () => expect((await saved(repo)).find((e) => e.id === 'payday')?.visible).toBe(false));
    expect(screen.getByTestId('home-edit-toggle-payday').props.value).toBe(false);
    await fireEvent(screen.getByTestId('home-edit-toggle-year'), 'valueChange', true);
    await waitFor(async () => expect((await saved(repo)).find((e) => e.id === 'year')?.visible).toBe(true));
  });

  it('moves a card up and down and saves the order', async () => {
    const { repo } = await open();
    await fireEvent.press(await screen.findByTestId('home-edit-up-upcoming'));
    await waitFor(async () => expect((await saved(repo)).map((e) => e.id).slice(3, 5)).toEqual(['upcoming', 'alerts']));
    await fireEvent.press(screen.getByTestId('home-edit-down-balance'));
    await waitFor(async () => expect((await saved(repo)).map((e) => e.id).slice(0, 2)).toEqual(['payday', 'balance']));
    expect(screen.getByTestId('home-edit-up-payday').props.accessibilityState.disabled).toBe(true);
  });

  it('two quick taps add up (the second one starts from the first)', async () => {
    const { repo } = await open();
    await fireEvent.press(await screen.findByTestId('home-edit-down-balance'));
    await fireEvent.press(screen.getByTestId('home-edit-down-balance'));
    await waitFor(async () => expect((await saved(repo)).map((e) => e.id).slice(0, 3)).toEqual(['payday', 'tiles', 'balance']));
  });

  it('resets to the default order and visibility, and removes added charts', async () => {
    const { repo } = await open();
    await fireEvent.press(await screen.findByTestId('home-edit-down-balance'));
    await fireEvent(screen.getByTestId('home-edit-toggle-tiles'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('home-edit-add-income-vs-spending'));
    await waitFor(async () => expect(await saved(repo)).not.toEqual(defaultHomeLayout()));
    await fireEvent.press(screen.getByTestId('home-edit-reset'));
    await waitFor(async () => expect(await saved(repo)).toEqual(defaultHomeLayout()));
    expect(screen.queryByTestId('home-edit-row-chart-income-vs-spending')).toBeNull();
    expect(screen.getByTestId('home-edit-reset').props.accessibilityState.disabled).toBe(true);
  });

  it('adds a chart once: it joins the list at the end, shown, and the gallery says Added', async () => {
    const { repo } = await open();
    expect(screen.queryByTestId('home-edit-row-chart-income-vs-spending')).toBeNull();
    await fireEvent.press(await screen.findByTestId('home-edit-add-income-vs-spending'));
    await waitFor(async () => expect((await saved(repo)).at(-1)).toEqual({ id: 'chart:income-vs-spending', visible: true }));
    expect(screen.getByTestId('home-edit-row-chart-income-vs-spending')).toBeTruthy();
    expect(screen.getByTestId('home-edit-added-income-vs-spending')).toBeTruthy();
    expect(screen.queryByTestId('home-edit-add-income-vs-spending')).toBeNull();
  });

  it('offers Pro charts to free users with a note that they show a sample, and adds them', async () => {
    const { repo } = await open();
    expect((await screen.findAllByText(/Without Pro it shows a labelled sample/)).length).toBe(2);
    await fireEvent.press(screen.getByTestId('home-edit-add-debt-payoff'));
    await waitFor(async () => expect((await saved(repo)).some((e) => e.id === 'chart:debt-payoff')).toBe(true));
  });

  it('removes an added chart (it can be added again) but fixed cards have no Remove', async () => {
    const { repo } = await open();
    expect(screen.queryByTestId('home-edit-remove-payday')).toBeNull();
    await fireEvent.press(await screen.findByTestId('home-edit-add-savings-rate'));
    await fireEvent.press(await screen.findByTestId('home-edit-remove-chart-savings-rate'));
    await waitFor(async () => expect((await saved(repo)).some((e) => e.id === 'chart:savings-rate')).toBe(false));
    expect(await screen.findByTestId('home-edit-add-savings-rate')).toBeTruthy();
  });

  it('Done goes back', async () => {
    await open();
    await fireEvent.press(await screen.findByTestId('home-edit-done'));
    expect(router.back).toHaveBeenCalled();
  });
});
