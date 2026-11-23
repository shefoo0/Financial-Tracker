// Stand-in for '@/features/edit' in Home tests: a pencil button and sheets that only show their name when open.
// Use: jest.mock('@/features/edit', () => require('../../../test-support/edit-mock'));
import { Pressable, Text } from 'react-native';

export const EditButton = ({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} testID={testID}>
    <Text>✎</Text>
  </Pressable>
);
const sheet = (name: string) => {
  const Sheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
    visible ? (
      <Pressable onPress={onClose} testID={`sheet-${name}`}>
        <Text>{`${name} sheet`}</Text>
      </Pressable>
    ) : null;
  return Sheet;
};
export const BalanceSheet = sheet('balance');
export const PaydaySheet = sheet('payday');
export const RemindersSheet = sheet('reminders');
export const AlertsSheet = sheet('alerts');
export const SpendingSheet = sheet('spending');
export const AppearanceSheet = sheet('appearance');
export const MoneySheet = sheet('money');
