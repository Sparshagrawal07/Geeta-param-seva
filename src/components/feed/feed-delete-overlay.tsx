import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

interface FeedDeleteOverlayProps {
  visible: boolean;
  buttonX: number;
  buttonY: number;
  deleting?: boolean;
  onDismiss: () => void;
  onDeletePress: () => void;
}

export function FeedDeleteOverlay({
  visible,
  buttonX,
  buttonY,
  deleting = false,
  onDismiss,
  onDeletePress,
}: FeedDeleteOverlayProps) {
  const colors = useAppColors();

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [onDismiss, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Pressable
          onPress={() => {
            void triggerHaptic('warning');
            onDeletePress();
          }}
          disabled={deleting}
          style={{
            position: 'absolute',
            left: buttonX,
            top: buttonY,
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.destructiveBg,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 6,
            zIndex: 1,
          }}>
          {deleting ? (
            <ActivityIndicator size="small" color={colors.destructiveFg} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={colors.destructiveFg} />
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(43, 34, 30, 0.12)',
  },
});
