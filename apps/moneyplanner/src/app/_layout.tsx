// Root layout: opens the database, provides data to every screen, and sets up
// the stack (tabs + forms). Owned by the lead.
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { Button, EmptyState, KeyboardDoneBar, Screen } from '@/components/ui';
import { createRepository } from '@/data/create-repository';
import { DataProvider } from '@/data/DataProvider';
import type { Repository } from '@/data/repository';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = createRepository();
        await r.init();
        if (!cancelled) setRepo(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        SplashScreen.hideAsync();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {error ? (
        <Screen>
          <EmptyState
            title="Your data couldn't be opened"
            message={`Nothing has been deleted. Try again, and if it keeps happening, restore a backup from Settings. (${error})`}
            action={<Button label="Try again" onPress={() => { setError(null); setAttempt((a) => a + 1); }} testID="retry-open" />}
          />
        </Screen>
      ) : repo ? (
        <DataProvider repo={repo}>
          <KeyboardDoneBar />
          <Stack screenOptions={{ headerBackTitle: 'Back' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal', title: 'Recurring item' }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'One-time item' }} />
            <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          </Stack>
        </DataProvider>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator accessibilityLabel="Opening your data" />
        </View>
      )}
    </ThemeProvider>
  );
}
