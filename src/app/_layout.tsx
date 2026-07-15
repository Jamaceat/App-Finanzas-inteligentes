import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NotificationsSync } from '@/components/notifications-sync';
import { DatabaseMigrator } from '@/db/migrator';
import { AppDataProvider } from '@/providers/app-data';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <DatabaseMigrator>
          <AppDataProvider>
            <NotificationsSync />
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="recurring-rules" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="asignar-gastos" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="trash" options={{ presentation: 'modal', headerShown: false }} />
            </Stack>
          </AppDataProvider>
        </DatabaseMigrator>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
