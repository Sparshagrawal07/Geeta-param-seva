import { Modal, Pressable, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

interface JoinPinRevealModalProps {
  visible: boolean;
  pin: string;
  expiresAt: string | Date;
  groupName?: string;
  onClose: () => void;
}

function formatExpiry(expiresAt: string | Date): string {
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function JoinPinRevealModal({
  visible,
  pin,
  expiresAt,
  groupName,
  onClose,
}: JoinPinRevealModalProps) {
  const { t } = useLocale();
  const expiryLabel = formatExpiry(expiresAt);

  const handleShare = async () => {
    try {
      await Share.share({
        message: groupName
          ? `${t('appName')} — ${groupName}\n${t('joinPinShareLabel')}: ${pin}\n${t('joinPinExpiresLabel')}: ${expiryLabel}`
          : `${t('joinPinShareLabel')}: ${pin}\n${t('joinPinExpiresLabel')}: ${expiryLabel}`,
      });
      void triggerHaptic('success');
    } catch {
      void triggerHaptic('error');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <SafeAreaView edges={['top', 'bottom']} className="w-full max-w-md">
          <View className="rounded-2xl border border-gp-border bg-gp-card p-5 dark:border-gp-border-dark dark:bg-gp-card-dark">
            <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
              {t('joinPinRevealTitle')}
            </AppText>
            <AppText className="mt-2 text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
              {t('joinPinRevealHint')}
            </AppText>

            <View className="mt-5 items-center rounded-xl border border-gp-border bg-gp-bg px-4 py-5 dark:border-gp-border-dark dark:bg-gp-bg-dark">
              <AppText bold className="text-3xl tracking-widest text-gp-text dark:text-gp-text-dark">
                {pin}
              </AppText>
              {expiryLabel ? (
                <AppText className="mt-3 text-center text-sm text-gp-muted dark:text-gp-muted-dark">
                  {t('joinPinExpiresLabel')}: {expiryLabel}
                </AppText>
              ) : null}
            </View>

            <View className="mt-5 gap-3">
              <AppButton label={t('joinPinShare')} fullWidth onPress={() => void handleShare()} />
              <AppButton
                label={t('joinPinDone')}
                variant="secondary"
                fullWidth
                onPress={() => {
                  void triggerHaptic('light');
                  onClose();
                }}
              />
            </View>

            <Pressable onPress={onClose} className="mt-3 items-center py-2">
              <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                {t('joinPinShownOnce')}
              </AppText>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
