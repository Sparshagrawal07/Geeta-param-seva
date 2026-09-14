import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAuth } from '@/hooks/use-auth';
import { triggerHaptic } from '@/lib/haptics';
import { type ThemeMode } from '@/lib/theme';
import { isAdminRole } from '@/lib/users';
import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';
import { useNotificationsSetup } from '@/providers/notification-provider';
import { useThemeSettings } from '@/providers/theme-provider';
import { deleteUserAccount } from '@/services/account';

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <AppText bold className="mb-2 px-1 text-xs uppercase tracking-wide text-gp-muted dark:text-gp-muted-dark">
        {title}
      </AppText>
      <View className="overflow-hidden rounded-2xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  label,
  onPress,
  destructive = false,
  showChevron = false,
  detail,
  right,
  last = false,
}: {
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  detail?: string;
  right?: ReactNode;
  last?: boolean;
}) {
  const colors = useAppColors();
  const content = (
    <>
      <View className="min-w-0 flex-1 pr-3">
        <AppText
          className={`text-[15px] ${destructive ? 'text-destructive' : 'text-gp-text dark:text-gp-text-dark'}`}>
          {label}
        </AppText>
        {detail ? (
          <AppText className="mt-0.5 text-sm text-gp-muted dark:text-gp-muted-dark">{detail}</AppText>
        ) : null}
      </View>
      {right}
      {showChevron && !right ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={destructive ? colors.destructiveText : colors.placeholder}
        />
      ) : null}
    </>
  );

  const rowClass = `flex-row items-center px-4 py-3.5 ${
    last ? '' : 'border-b border-gp-border dark:border-gp-border-dark'
  }`;

  if (!onPress) {
    return <View className={rowClass}>{content}</View>;
  }

  return (
    <Pressable
      className={rowClass}
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}>
      {content}
    </Pressable>
  );
}

function ThemeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className={`flex-1 items-center rounded-xl border px-2 py-2.5 ${
        active
          ? 'border-saffron bg-saffron/10'
          : 'border-gp-border bg-gp-bg dark:border-gp-border-dark dark:bg-gp-bg-dark'
      }`}>
      <AppText
        bold={active}
        className={`text-sm ${active ? 'text-saffron' : 'text-gp-text dark:text-gp-text-dark'}`}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface SettingsPanelProps {
  showProfileSummary?: boolean;
  name?: string;
  phoneNumber?: string;
}

/** Hidden in UI for now; keep wiring for store account-deletion compliance. */
const DELETE_ACCOUNT_VISIBLE = false;

export function SettingsPanel({ showProfileSummary = false, name, phoneNumber }: SettingsPanelProps) {
  const { profile, signOutUser } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const { mode, setMode, isDark } = useThemeSettings();
  const {
    permissionStatus,
    notificationsEnabled,
    requestPermissions,
    setNotificationsEnabled,
    previewReminderSound,
    openSystemNotificationSettings,
  } = useNotificationsSetup();
  const [busy, setBusy] = useState(false);

  const pushDetail =
    permissionStatus !== 'granted'
      ? t('notificationsOff')
      : notificationsEnabled
        ? t('notificationsOn')
        : t('notificationsMuted');

  const showPermissionHelp = (soundDenied = false) => {
    confirm({
      title: t('notificationsPermissionTitle'),
      message: soundDenied ? t('notificationsSoundDenied') : t('notificationsPermissionDenied'),
      confirmLabel: t('openSystemSettings'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void openSystemNotificationSettings();
      },
    });
  };

  const handleEnableNotifications = async () => {
    try {
      setBusy(true);
      const granted = await requestPermissions();
      if (!granted) {
        showPermissionHelp(permissionStatus === 'granted');
        return;
      }
      await setNotificationsEnabled(true);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (busy) return;
    if (!notificationsEnabled || permissionStatus !== 'granted') {
      await handleEnableNotifications();
      return;
    }
    try {
      setBusy(true);
      await setNotificationsEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewSound = async () => {
    try {
      setBusy(true);
      const granted = await requestPermissions();
      if (!granted) {
        showPermissionHelp(permissionStatus === 'granted');
        return;
      }
      await previewReminderSound();
    } catch (error) {
      if (error instanceof Error && error.message === 'NOTIFICATION_SOUND_DENIED') {
        showPermissionHelp(true);
        return;
      }
      alert({
        title: t('notificationsPermissionTitle'),
        message: t('previewReminderSoundExpoGo'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    confirm({
      title: t('signOutConfirmTitle'),
      message: isAdminRole(profile?.role)
        ? t('signOutConfirmMessageAdmin')
        : t('signOutConfirmMessageMember'),
      confirmLabel: t('signOut'),
      cancelLabel: t('cancel'),
      destructive: true,
      onConfirm: () => {
        void signOutUser();
      },
    });
  };

  const handleDeleteAccount = () => {
    confirm({
      title: t('deleteAccountTitle'),
      message: t('deleteAccountConfirm'),
      confirmLabel: t('deleteAccountConfirmAction'),
      destructive: true,
      onConfirm: () => {
        void deleteUserAccount().then(async () => {
          await signOutUser();
        });
      },
    });
  };

  const themeModes: Array<{ value: ThemeMode; label: string }> = [
    { value: 'system', label: t('settingsThemeSystem') },
    { value: 'light', label: t('settingsThemeLight') },
    { value: 'dark', label: t('settingsThemeDark') },
  ];

  return (
    <View>
      {showProfileSummary ? (
        <View className="mb-5 rounded-2xl border border-gp-border bg-gp-card px-4 py-4 dark:border-gp-border-dark dark:bg-gp-card-dark">
          <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
            {name || t('emptyValue')}
          </AppText>
          <AppText className="mt-1 text-sm text-gp-muted dark:text-gp-muted-dark">
            {phoneNumber || t('emptyValue')}
          </AppText>
        </View>
      ) : null}

      <SettingsSection title={t('settingsAppearance')}>
        <View className="border-b border-gp-border px-4 py-4 dark:border-gp-border-dark">
          <AppText className="mb-3 text-sm text-gp-muted dark:text-gp-muted-dark">
            {t('settingsTheme')}
          </AppText>
          <View className="flex-row gap-2">
            {themeModes.map((entry) => (
              <ThemeChip
                key={entry.value}
                label={entry.label}
                active={mode === entry.value}
                onPress={() => setMode(entry.value)}
              />
            ))}
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settingsLanguage')}>
        <SettingsRow label={t('settingsLanguage')} showChevron={false} right={<LanguageToggle />} last />
      </SettingsSection>

      <SettingsSection title={t('notificationsSettingsSection')}>
        <SettingsRow
          label={
            permissionStatus !== 'granted' || !notificationsEnabled
              ? t('enableNotifications')
              : t('disableNotifications')
          }
          detail={pushDetail}
          onPress={() => void handleToggleNotifications()}
        />
        <SettingsRow
          label={t('previewReminderSound')}
          onPress={() => void handlePreviewSound()}
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settingsAccount')}>
        {isAdminRole(profile?.role) ? (
          <SettingsRow
            label={t('changePersonalPin')}
            detail={t('sessionSoleDeviceHint')}
            onPress={() => router.push('/set-personal-pin')}
            showChevron
          />
        ) : null}
        <SettingsRow label={t('signOut')} onPress={handleSignOut} last={!DELETE_ACCOUNT_VISIBLE} />
        {DELETE_ACCOUNT_VISIBLE ? (
          <SettingsRow
            label={t('deleteAccount')}
            onPress={handleDeleteAccount}
            destructive
            last
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('legalSectionTitle')}>
        <SettingsRow
          label={t('privacyPolicy')}
          onPress={() => router.push('/legal/privacy')}
          showChevron
        />
        <SettingsRow
          label={t('termsOfService')}
          onPress={() => router.push('/legal/terms')}
          showChevron
          last
        />
      </SettingsSection>
    </View>
  );
}
