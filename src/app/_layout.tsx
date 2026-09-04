import '@/global.css';
import 'react-native-reanimated';

import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari/400Regular';
import { NotoSansDevanagari_700Bold } from '@expo-google-fonts/noto-sans-devanagari/700Bold';
import { SplineSans_600SemiBold } from '@expo-google-fonts/spline-sans/600SemiBold';
import { SplineSans_700Bold } from '@expo-google-fonts/spline-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { useEffect, useMemo, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useAppColors } from '@/hooks/use-app-colors';
import { ThemeProvider, useThemeSettings } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { AdsProvider } from '@/providers/ads-provider';
import { AlertProvider } from '@/providers/alert-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import {
  AuthNavigationBoundary,
  NotificationProvider,
} from '@/providers/notification-provider';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { background, isDark } = useAppColors();

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="complete-profile" />
        <Stack.Screen name="set-personal-pin" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  const { colors } = useThemeSettings();
  const accentVars = useMemo(
    () =>
      vars({
        '--color-accent': colors.accentRgb,
      }),
    [colors.accentRgb]
  );

  return (
    <GestureHandlerRootView style={[{ flex: 1, backgroundColor: colors.background }, accentVars]}>
      {children}
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_700Bold,
    SplineSans_600SemiBold,
    SplineSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootShell>
        <SafeAreaProvider>
          <LocaleProvider>
            <AlertProvider>
              <ErrorBoundary fallbackMessage="Something went wrong." retryLabel="Try again">
                <AuthProvider>
                  <AdsProvider>
                    <NotificationProvider>
                      <AuthNavigationBoundary>
                        <RootNavigator />
                      </AuthNavigationBoundary>
                    </NotificationProvider>
                  </AdsProvider>
                </AuthProvider>
              </ErrorBoundary>
            </AlertProvider>
          </LocaleProvider>
        </SafeAreaProvider>
      </RootShell>
    </ThemeProvider>
  );
}
