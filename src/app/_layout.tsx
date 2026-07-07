import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NotificationsSync } from '@/components/notifications-sync';
import { DatabaseMigrator } from '@/db/migrator';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <DatabaseMigrator>
          <NotificationsSync />
          <AnimatedSplashOverlay />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="recurring-rules" options={{ presentation: 'modal', headerShown: false }} />
          </Stack>
        </DatabaseMigrator>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
