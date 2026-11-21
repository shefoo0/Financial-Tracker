import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { useDiscardGuard } from '@/features/items/useDiscardGuard';

import { preventRemove, resetRouterMock, router } from '../../../../test-support/expo-router-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));

function Form({ dirty }: { dirty: boolean }) {
  const leave = useDiscardGuard(dirty);
  return (
    <Pressable testID="leave" onPress={leave}>
      <Text>Leave</Text>
    </Pressable>
  );
}

const event = () => ({ data: { action: {} }, repeat: jest.fn() });

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});

describe('useDiscardGuard', () => {
  it('does not prevent leaving a clean form', async () => {
    await render(<Form dirty={false} />);
    expect(preventRemove.current).toBe(false);
  });

  it('prevents leaving a dirty form and follows the flag', async () => {
    const { rerender } = await render(<Form dirty />);
    expect(preventRemove.current).toBe(true);
    await rerender(<Form dirty={false} />);
    expect(preventRemove.current).toBe(false);
  });

  it('leave() goes back, and the guard then repeats without asking', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<Form dirty />);
    await fireEvent.press(screen.getByTestId('leave'));
    expect(router.back).toHaveBeenCalledTimes(1);
    const e = event();
    preventRemove.callback!(e);
    expect(e.repeat).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    // Stopped once more right after: still repeats without asking.
    const again = event();
    preventRemove.callback!(again);
    expect(again.repeat).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks "Discard changes?" on back without leave(); Discard repeats', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<Form dirty />);
    const e = event();
    act(() => preventRemove.callback!(e));
    expect(e.repeat).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('Discard changes?');
    expect(buttons!.map((b) => b.text)).toEqual(['Keep editing', 'Discard']);
    // Keep editing does nothing.
    buttons![0].onPress?.();
    expect(e.repeat).not.toHaveBeenCalled();
    buttons![1].onPress?.();
    expect(e.repeat).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });
});
