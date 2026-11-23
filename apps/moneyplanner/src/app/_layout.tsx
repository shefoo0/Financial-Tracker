// Root layout: opens the database, provides data to every screen, and sets up
// the stack (tabs + forms). Owned by the lead.
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, EmptyState, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import { AlertScheduler } from '@/features/alerts/AlertScheduler';
import { AutoBackup } from '@/features/backup/AutoBackup';
import { IncomingShareHandler } from '@/features/import/IncomingShareHandler';
import { LockGate } from '@/features/lock/LockGate';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

function HideSplash() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

/** Navigation colours follow the Appearance setting (read inside the provider). */
function Themed({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: c.background, card: c.backgroundElement, text: c.text, border: c.border, primary: c.accent },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ProfileProvider
      renderLoading={() => (
        <Themed>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator accessibilityLabel="Opening your data" />
          </View>
        </Themed>
      )}
      renderError={(error, retry) => (
        <Themed>
          <HideSplash />
          <Screen>
            <EmptyState
              title="Your data couldn't be opened"
              message={`Nothing has been deleted. Try again, and if it keeps happening, restore a backup from Settings. (${error})`}
              action={<Button label="Try again" onPress={retry} testID="retry-open" />}
            />
          </Screen>
        </Themed>
      )}>
      <Themed>
        <HideSplash />
        <AlertScheduler />
        <AutoBackup />
        <LockGate>
          <IncomingShareHandler />
          <Stack screenOptions={{ headerBackTitle: 'Back', headerShadowVisible: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal', title: 'Recurring item' }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'One-time item' }} />
            <Stack.Screen name="home-edit" options={{ title: 'Edit Home' }} />
            <Stack.Screen name="backups" options={{ title: 'Backups & export' }} />
            <Stack.Screen name="about" options={{ title: 'About' }} />
            <Stack.Screen name="lock-settings" options={{ title: 'Lock' }} />
            <Stack.Screen name="categories" options={{ title: 'Categories' }} />
            <Stack.Screen name="profiles" options={{ title: 'Profiles' }} />
            <Stack.Screen name="debts/index" options={{ title: '', headerBackTitle: 'Plan' }} />
            <Stack.Screen name="debts/[id]" options={{ presentation: 'modal', title: 'Debt' }} />
            <Stack.Screen name="cheques/index" options={{ title: '', headerBackTitle: 'Plan' }} />
            <Stack.Screen name="cheques/[id]" options={{ presentation: 'modal', title: 'Cheque' }} />
            <Stack.Screen name="import/index" options={{ title: '', headerBackTitle: 'Back' }} />
            <Stack.Screen name="import/review" options={{ title: 'Review', headerBackTitle: 'Import' }} />
            <Stack.Screen name="import/columns" options={{ title: 'Columns', headerBackTitle: 'Import' }} />
            <Stack.Screen name="reports/index" options={{ title: '', headerBackTitle: 'Home' }} />
            <Stack.Screen name="reports/[key]" options={{ title: 'Report', headerBackTitle: 'Reports' }} />
          </Stack>
        </LockGate>
      </Themed>
    </ProfileProvider>
  );
}
