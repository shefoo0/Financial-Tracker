// Shared jest mock for expo-router. Use: jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
import { useEffect } from 'react';
import { Text } from 'react-native';

export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
};
export const params: { current: Record<string, string | undefined> } = { current: {} };

export const useRouter = () => router;
export const useLocalSearchParams = () => params.current;
export const Stack = Object.assign(({ children }: { children?: React.ReactNode }) => <>{children}</>, {
  Screen: () => null,
});
export const Redirect = ({ href }: { href: string }) => <Text testID="redirect">{String(href)}</Text>;
// Runs the effect once on mount, like a screen gaining focus.
export const useFocusEffect = (effect: () => void | (() => void)) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(effect, [effect]);
};
export const navigation = { addListener: jest.fn(() => () => undefined), dispatch: jest.fn() };
export const useNavigation = () => navigation;
// Records what useDiscardGuard registered, so tests can fire the beforeRemove callback themselves.
// (A real navigator only exists on a device; there the prompt is a device check.)
export const preventRemove: {
  current: boolean;
  callback: ((e: { data: { action: unknown }; repeat: () => void }) => void) | null;
} = { current: false, callback: null };
export const usePreventRemove = (
  prevent: boolean,
  callback: (e: { data: { action: unknown }; repeat: () => void }) => void,
) => {
  preventRemove.current = prevent;
  preventRemove.callback = callback;
};
export const Link = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

export function resetRouterMock() {
  router.push.mockClear();
  router.replace.mockClear();
  router.back.mockClear();
  router.navigate.mockClear();
  params.current = {};
  preventRemove.current = false;
  preventRemove.callback = null;
}
