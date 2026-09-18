import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  label: string;
  value: string | null;
  options: AppSelectOption[];
  onSelect: (value: string) => void;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  /** When true, shows the value but cannot open the menu (e.g. single option) */
  readOnly?: boolean;
}

export function AppSelect({
  label,
  value,
  options,
  onSelect,
  hint,
  disabled = false,
  placeholder,
  readOnly = false,
}: AppSelectProps) {
  const { t } = useLocale();
  const colors = useAppColors();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  const canOpen = !readOnly && !disabled && options.length > 1;

  const close = () => setOpen(false);

  const handleSelect = (nextValue: string) => {
    if (nextValue !== value) {
      void triggerHaptic('selection');
      onSelect(nextValue);
    }
    close();
  };

  return (
    <View className="gap-2">
      <AppText className="text-sm leading-5 text-gp-muted dark:text-gp-muted-dark">{label}</AppText>

      <Pressable
        disabled={!canOpen}
        onPress={() => setOpen(true)}
        className={`flex-row items-center rounded-lg border px-4 py-3 ${
          canOpen
            ? 'border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark'
            : 'border-saffron/30 bg-saffron/5 dark:bg-saffron/10'
        }`}
        style={{ opacity: disabled ? 0.55 : 1 }}>
        <View className="min-w-0 flex-1">
          <AppText
            bold={!!selected}
            className={`text-base leading-6 ${
              selected ? 'text-gp-text dark:text-gp-text-dark' : 'text-gp-muted dark:text-gp-muted-dark'
            }`}
            numberOfLines={1}>
            {selected?.label ?? placeholder ?? t('selectGroup')}
          </AppText>
        </View>
        {canOpen ? (
          <Ionicons name="chevron-down" size={18} color={colors.placeholder} style={{ marginLeft: 8 }} />
        ) : null}
      </Pressable>

      {hint ? (
        <AppText className="text-sm leading-5 text-gp-muted dark:text-gp-muted-dark">{hint}</AppText>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />

          <GlassSurface
            style={{
              width: '100%',
              maxWidth: 400,
              maxHeight: '70%',
              borderRadius: 16,
            }}
            fallbackStyle={{
              width: '100%',
              maxWidth: 400,
              maxHeight: '70%',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.gpBorder,
              backgroundColor: colors.gpCard,
              overflow: 'hidden',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: colors.gpBorder,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}>
              <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                {label}
              </AppText>
              <Pressable onPress={close} hitSlop={12}>
                <AppText className="text-base text-saffron dark:text-saffron-light">{t('close')}</AppText>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option, index) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSelect(option.value)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: index < options.length - 1 ? 1 : 0,
                      borderBottomColor: colors.gpBorder,
                      backgroundColor: active ? `${colors.saffron}18` : 'transparent',
                    }}>
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0 flex-1">
                        <Text
                          style={{
                            fontSize: 16,
                            lineHeight: 22,
                            fontWeight: active ? '700' : '500',
                            color: active ? colors.saffron : colors.gpText,
                          }}
                          numberOfLines={1}>
                          {option.label}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.saffron} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </GlassSurface>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(43, 34, 30, 0.45)',
  },
});
