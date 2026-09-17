import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializeDatabase, type DatabaseStatus } from '@/services/storage';
import { colors } from '@/theme';

export default function RootLayout() {
  const [, setDbStatus] = useState<DatabaseStatus>({ state: 'idle' });

  useEffect(() => {
    let cancelled = false;
    initializeDatabase()
      .then((status) => {
        if (!cancelled) {
          setDbStatus(status);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDbStatus({
            state: 'error',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', headerShown: true, title: '設定' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
