import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Categories from '@/app/categories';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock } from '../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});


const settings = { ...defaultSettings(), onboarded: true };

describe('Categories', () => {
  it('lists the default categories', async () => {
    await renderWithRepo(<Categories />, { settings });
    expect(await screen.findByText('Salary')).toBeTruthy();
    expect(screen.getByText('Housing')).toBeTruthy();
  });

  it('shows empty messages when there are no categories', async () => {
    await renderWithRepo(<Categories />, { settings, categories: [] });
    expect(await screen.findByText('No income categories yet.')).toBeTruthy();
    expect(screen.getByText('No costs categories yet.')).toBeTruthy();
  });

  it('adds a category and rejects duplicates and empty names', async () => {
    const { repo } = await renderWithRepo(<Categories />, { settings });
    await fireEvent.press(await screen.findByTestId('categories-add'));
    await fireEvent.press(screen.getByTestId('category-save'));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('category-name'), 'housing');
    await fireEvent.press(screen.getByTestId('category-save'));
    expect(await screen.findByText('You already have a category with this name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('category-name'), 'Pets');
    await fireEvent.press(screen.getByTestId('category-save'));
    await waitFor(async () => expect((await repo.listCategories()).some((c) => c.name === 'Pets' && c.kind === 'cost')).toBe(true));
    expect(await screen.findByText('Pets')).toBeTruthy();
  });

  it('renames a category', async () => {
    const { repo } = await renderWithRepo(<Categories />, { settings });
    await fireEvent.press(await screen.findByTestId('category-housing'));
    await fireEvent.changeText(screen.getByTestId('category-name'), 'Home');
    await fireEvent.press(screen.getByTestId('category-save'));
    await waitFor(async () => expect((await repo.listCategories()).find((c) => c.id === 'housing')!.name).toBe('Home'));
  });

  it('sets, shows and clears a monthly limit on a cost category', async () => {
    const { repo } = await renderWithRepo(<Categories />, { settings });
    expect((await screen.findByTestId('category-limit-groceries')).props.children).toBe('No monthly limit');
    await fireEvent.press(screen.getByTestId('category-groceries'));
    await fireEvent.changeText(screen.getByTestId('category-limit-input'), '1500');
    await fireEvent.press(screen.getByTestId('category-save'));
    await waitFor(async () => expect((await repo.listCategories()).find((c) => c.id === 'groceries')!.monthlyLimit).toBe(150000));
    await waitFor(() => expect(screen.getByTestId('category-limit-groceries').props.children).toBe('Limit AED 1,500.00 a month'));
    await fireEvent.press(screen.getByTestId('category-groceries'));
    await fireEvent.changeText(screen.getByTestId('category-limit-input'), '');
    await fireEvent.press(screen.getByTestId('category-save'));
    await waitFor(async () => expect((await repo.listCategories()).find((c) => c.id === 'groceries')!.monthlyLimit).toBeNull());
  });

  it('offers no limit field for income categories', async () => {
    await renderWithRepo(<Categories />, { settings });
    await fireEvent.press(await screen.findByTestId('category-salary'));
    expect(screen.queryByTestId('category-limit-input')).toBeNull();
  });

  it('removes an unused category after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { repo } = await renderWithRepo(<Categories />, { settings });
    await fireEvent.press(await screen.findByTestId('category-health'));
    await fireEvent.press(screen.getByTestId('category-remove'));
    await (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Remove')!.onPress!();
    await waitFor(async () => expect((await repo.listCategories()).some((c) => c.id === 'health')).toBe(false));
  });
});
