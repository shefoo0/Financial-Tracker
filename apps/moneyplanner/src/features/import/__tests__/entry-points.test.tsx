import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { defaultSettings } from '@/data/defaults';
import { ModuleCards } from '@/features/plan/ModuleCards';
import { QuickAddButton } from '@/features/quickadd/QuickAddButton';
import type { PlanInput } from '@/types';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
let mockPro = false;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const input = { settings: defaultSettings(), cheques: [], debts: [] } as unknown as PlanInput;

beforeEach(() => {
  resetRouterMock();
  mockPro = false;
});

describe('Import entry points', () => {
  it('Plan has an "Import statements" card that opens /import, and tells free users it is Pro', async () => {
    await render(<ModuleCards input={input} />);
    const card = screen.getByTestId('plan-open-import');
    expect(card.props.accessibilityLabel).toContain('Import statements');
    expect(card.props.accessibilityLabel).toContain('Pro');
    await fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith('/import');
  });

  it('the card of a Pro user does not mention Pro', async () => {
    mockPro = true;
    await render(<ModuleCards input={input} />);
    expect(screen.getByTestId('plan-open-import').props.accessibilityLabel).not.toContain('Pro');
  });

  it('the quick-add sheet has "Import a statement"', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QuickAddButton />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId('quick-add'));
    await fireEvent.press(await screen.findByTestId('quick-add-import'));
    expect(router.push).toHaveBeenCalledWith('/import');
  });
});
