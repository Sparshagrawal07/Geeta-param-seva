import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { spiritualTabBar } from '@/lib/spiritual-ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON_SLOT = 32;
const ICON_SIZE = 24;

interface DevotionalTabIconProps {
  name: IconName;
  focusedName?: IconName;
  color: ColorValue;
  size?: number;
  focused?: boolean;
}

export function DevotionalTabIcon({
  name,
  focusedName,
  color,
  size = ICON_SIZE,
  focused = false,
}: DevotionalTabIconProps) {
  const { isDark } = useAppColors();
  const iconName = focused && focusedName ? focusedName : name;

  return (
    <View
      style={{
        width: ICON_SLOT,
        height: ICON_SLOT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {focused ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: ICON_SLOT + 6,
            height: ICON_SLOT + 6,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(232, 197, 71, 0.55)' : 'rgba(232, 197, 71, 0.45)',
            backgroundColor: isDark ? 'rgba(232, 197, 71, 0.14)' : 'rgba(232, 197, 71, 0.1)',
            shadowColor: spiritualTabBar.active,
            shadowOpacity: 0.28,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      ) : null}
      <Ionicons name={iconName} size={size} color={color} />
    </View>
  );
}
