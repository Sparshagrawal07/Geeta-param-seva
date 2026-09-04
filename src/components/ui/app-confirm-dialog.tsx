import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

export interface AppConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AppConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: AppConfirmDialogProps) {
  const colors = useAppColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

        <View
          style={{
            width: '100%',
            maxWidth: 340,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.gpBorder,
            backgroundColor: colors.gpCard,
            overflow: 'hidden',
            zIndex: 1,
          }}>
          <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: message ? 10 : 16 }}>
            <Text
              style={{
                fontSize: 17,
                lineHeight: 24,
                fontWeight: '700',
                color: colors.gpText,
              }}>
              {title}
            </Text>
            {message ? (
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.placeholder,
                }}>
                {message}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: colors.gpBorder,
            }}>
            {cancelLabel ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onCancel();
                }}
                disabled={loading}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRightWidth: 1,
                  borderRightColor: colors.gpBorder,
                  opacity: loading ? 0.6 : 1,
                }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gpText }}>{cancelLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                void triggerHaptic(destructive ? 'warning' : 'light');
                onConfirm();
              }}
              disabled={loading}
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.6 : 1,
              }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: destructive ? colors.destructiveText : colors.saffron,
                }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(43, 34, 30, 0.45)',
  },
});
