import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';

export function useAndroidBackExit(enabled = true) {
  const router = useRouter();
  const { confirm, isOpen } = useAlert();
  const { t } = useLocale();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) {
        return;
      }

      const onBackPress = () => {
        if (isOpen) {
          return false;
        }

        if (router.canGoBack()) {
          router.back();
          return true;
        }

        confirm({
          title: t('exitAppTitle'),
          message: t('exitAppMessage'),
          confirmLabel: t('exitAppConfirm'),
          cancelLabel: t('cancel'),
          onConfirm: () => BackHandler.exitApp(),
        });
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [confirm, enabled, isOpen, router, t])
  );
}
