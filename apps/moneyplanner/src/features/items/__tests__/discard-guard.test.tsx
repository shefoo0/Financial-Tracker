import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { useDiscardGuard } from '@/features/items/useDiscardGuard';

import { preventRemove, resetRouterMock, router } from '../../../../test-support/expo-router-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));

function Form({ dirty }: { dirty: boolean }) {
  const guard = useDiscardGuard(dirty);
  return (
    <>
      <Pressable testID="begin" onPress={guard.begin}>
        <Text>Begin</Text>
      </Pressable>
      <Pressable testID="cancel" onPress={guard.cancel}>
        <Text>Cancel</Text>
      </Pressable>
      <Pressable testID="leave" onPress={() => guard.leave()}>
        <Text>Leave</Text>
      </Pressable>
    </>
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

  it('switches the guard off while a save runs (begin) and back on if it fails (cancel)', async () => {
    await render(<Form dirty />);
    expect(preventRemove.current).toBe(true);
    await fireEvent.press(screen.getByTestId('begin'));
    expect(preventRemove.current).toBe(false);
    await fireEvent.press(screen.getByTestId('cancel'));
    expect(preventRemove.current).toBe(true);
  });

  it('leave() goes back once, and the guard then neither asks nor repeats', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<Form dirty />);
    await fireEvent.press(screen.getByTestId('leave'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    const e = event();
    preventRemove.callback!(e);
    expect(e.repeat).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
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
