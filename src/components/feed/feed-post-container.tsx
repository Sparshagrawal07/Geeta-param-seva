import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppPressable } from '@/components/ui/app-pressable';
import { AppText } from '@/components/ui/app-text';
import { GlassIconButton } from '@/components/ui/glass-pressable';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

interface FeedPostContainerProps {
  children: ReactNode;
  deletable?: boolean;
  deleteActive?: boolean;
  onShowDelete?: (position: { x: number; y: number }) => void;
  reportable?: boolean;
  onReport?: () => void;
}

export function FeedPostContainer({
  children,
  deletable = false,
  deleteActive = false,
  onShowDelete,
  reportable = false,
  onReport,
}: FeedPostContainerProps) {
  const { saffron, gpCard, gpBorder, gpText } = useAppColors();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const containerRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const revealDelete = () => {
    void triggerHaptic('medium');
    containerRef.current?.measureInWindow((x, y, width) => {
      onShowDelete?.({ x: x + width - 46, y: y + 10 });
    });
  };

  const openMenu = () => {
    void triggerHaptic('light');
    setMenuOpen(true);
  };

  const body = (
    <View
      ref={containerRef}
      style={{
        position: 'relative',
        borderRadius: 16,
        borderWidth: deleteActive ? 2 : 0,
        borderColor: deleteActive ? saffron : 'transparent',
      }}>
      {reportable ? (
        <View className="absolute right-2 top-2 z-10">
          <GlassIconButton
            accessibilityRole="button"
            accessibilityLabel={t('reportContent')}
            onPress={openMenu}
            haptic="none"
            size={36}
            fallbackClassName="items-center justify-center rounded-full border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark"
            fallbackStyle={{ backgroundColor: `${gpCard}EE`, borderWidth: 1, borderColor: gpBorder }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={gpText} />
          </GlassIconButton>
        </View>
      ) : null}
      {children}
    </View>
  );

  const wrapped = deletable ? (
    <Pressable onLongPress={revealDelete} delayLongPress={400}>
      {body}
    </Pressable>
  ) : (
    body
  );

  return (
    <>
      {wrapped}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setMenuOpen(false)}
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ marginHorizontal: 16 }}>
            <GlassSurface
              style={{ borderRadius: 16 }}
              fallbackClassName="overflow-hidden rounded-2xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
              <AppPressable
                onPress={() => {
                  setMenuOpen(false);
                  onReport?.();
                }}
                haptic="light"
                minTouchSize={0}
                className="flex-row items-center gap-3 px-4 py-4">
                <Ionicons name="flag-outline" size={20} color={saffron} />
                <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                  {t('reportContent')}
                </AppText>
              </AppPressable>
            </GlassSurface>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
