import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { QuickAddButton } from '@/features/quickadd/QuickAddButton';

import { renderWithRepo } from '../../../../test-support/render';
import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));

beforeEach(resetRouterMock);

describe('QuickAddButton', () => {
  it('has an accessible Add button and opens the sheet', async () => {
    await renderWithRepo(<QuickAddButton />);
    const fab = screen.getByTestId('quick-add');
    expect(fab.props.accessibilityLabel).toBe('Add');
    expect(screen.queryByTestId('quick-add-sheet')).toBeNull();
    await fireEvent.press(fab);
    expect(await screen.findByTestId('quick-add-sheet')).toBeTruthy();
  });

  it.each([
    ['quick-add-income', '/recurring/new?kind=income'],
    ['quick-add-cost', '/recurring/new?kind=cost'],
    ['quick-add-one-time', '/transaction/new'],
  ])('%s pushes %s and closes the sheet', async (id, href) => {
    await renderWithRepo(<QuickAddButton />);
    await fireEvent.press(screen.getByTestId('quick-add'));
    await fireEvent.press(await screen.findByTestId(id));
    expect(router.push).toHaveBeenCalledWith(href);
    expect(screen.queryByTestId('quick-add-sheet')).toBeNull();
  });

  it('adds the default date to the one-time route', async () => {
    await renderWithRepo(<QuickAddButton defaultDate="2026-03-01" />);
    await fireEvent.press(screen.getByTestId('quick-add'));
    await fireEvent.press(await screen.findByTestId('quick-add-one-time'));
    expect(router.push).toHaveBeenCalledWith('/transaction/new?date=2026-03-01');
  });

  it('lists the one-time item first and highlights the last chosen row', async () => {
    await renderWithRepo(<QuickAddButton />);
    await fireEvent.press(screen.getByTestId('quick-add'));
    const rows = await screen.findAllByTestId(/^quick-add-(income|cost|one-time)$/);
    expect(rows[0].props.testID).toBe('quick-add-one-time');
    expect(screen.getByTestId('quick-add-one-time').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('quick-add-cost'));
    await fireEvent.press(screen.getByTestId('quick-add'));
    await waitFor(() => expect(screen.getByTestId('quick-add-cost').props.accessibilityState).toMatchObject({ selected: true }));
  });
});
