import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { AccountSettingsButton } from '@/components/legal/account-settings-button';
import { FadeInView } from '@/components/ui/fade-in-view';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { useReduceMotion } from '@/lib/motion';
import { spiritualDesignTokens } from '@/lib/spiritual-assets';

interface SpiritualScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  contentClassName?: string;
  scrollProps?: ScrollViewProps;
  showLanguageToggle?: boolean;
  showAccountSettings?: boolean;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  rightAction?: ReactNode;
  animateContent?: boolean;
  /** Constrain content width on tablets */
  centered?: boolean;
  /**
   * Safe-area edges. Default `['top']` for tab scenes (tab bar already clears system nav).
   * Use `['top','bottom']` on root stack screens without a tab bar (settings, legal).
   */
  edges?: ('top' | 'bottom')[];
}

export function SpiritualScreen({
  children,
  scrollable = true,
  contentClassName = 'px-5 pb-8 pt-2',
  scrollProps,
  showLanguageToggle = false,
  showAccountSettings = false,
  title,
  subtitle,
  onBack,
  showBack = false,
  rightAction,
  animateContent = true,
  centered = true,
  edges = ['top'],
}: SpiritualScreenProps) {
  const router = useRouter();
  const colors = useAppColors();
  const reduceMotion = useReduceMotion();
  const shouldAnimate = animateContent && !reduceMotion;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
  };

  const chrome =
    title || showBack || showLanguageToggle || showAccountSettings || rightAction ? (
      <View className="mb-2 w-full px-5 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            {showBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={handleBack}
                hitSlop={10}
                className="h-10 w-10 items-center justify-center rounded-full border border-saffron/25 bg-gp-card dark:border-gold/25 dark:bg-gp-card-dark">
                <Ionicons name="chevron-back" size={22} color={colors.gpText} />
              </Pressable>
            ) : null}
            {title ? (
              <View className="min-w-0 flex-1">
                <AppText variant="display" bold className="text-xl text-gp-text dark:text-gp-text-dark" numberOfLines={1}>
                  {title}
                </AppText>
                {subtitle ? (
                  <AppText className="mt-0.5 text-sm text-gp-muted dark:text-gp-muted-dark" numberOfLines={2}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            {rightAction}
            {showAccountSettings ? <AccountSettingsButton /> : null}
            {showLanguageToggle ? <LanguageToggle /> : null}
          </View>
        </View>
      </View>
    ) : null;

  const inner = (
    <View
      className={scrollable ? contentClassName : `flex-1 ${contentClassName}`}
      style={centered ? { maxWidth: spiritualDesignTokens.contentMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined}>
      {children}
    </View>
  );

  const body = shouldAnimate ? <FadeInView>{inner}</FadeInView> : inner;

  if (!scrollable) {
    return (
      <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={edges}>
        {chrome}
        {body}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={edges}>
      {chrome}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" {...scrollProps}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Auth form shell with keyboard avoidance. Top inset comes from AuthHeroHeader; bottom clears system nav. */
export function SpiritualAuthShell({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gp-bg dark:bg-gp-bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
