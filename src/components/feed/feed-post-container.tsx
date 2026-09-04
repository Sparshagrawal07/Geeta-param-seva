import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

interface FeedPostContainerProps {
  children: ReactNode;
  deletable?: boolean;
  deleteActive?: boolean;
  onShowDelete?: (position: { x: number; y: number }) => void;
}

export function FeedPostContainer({
  children,
  deletable = false,
  deleteActive = false,
  onShowDelete,
}: FeedPostContainerProps) {
  const { saffron } = useAppColors();
  const containerRef = useRef<View>(null);

  if (!deletable) {
    return <>{children}</>;
  }

  const revealDelete = () => {
    void triggerHaptic('medium');

    containerRef.current?.measureInWindow((x, y, width) => {
      onShowDelete?.({ x: x + width - 46, y: y + 10 });
    });
  };

  return (
    <Pressable onLongPress={revealDelete} delayLongPress={400}>
      <View
        ref={containerRef}
        style={{
          position: 'relative',
          borderRadius: 12,
          borderWidth: deleteActive ? 2 : 0,
          borderColor: deleteActive ? saffron : 'transparent',
        }}>
        {children}
      </View>
    </Pressable>
  );
}
