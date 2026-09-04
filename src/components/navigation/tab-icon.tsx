import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IconName;
  focusedName?: IconName;
  color: ColorValue;
  size: number;
  focused?: boolean;
}

export function TabIcon({ name, focusedName, color, size, focused = false }: TabIconProps) {
  const iconName = focused && focusedName ? focusedName : name;
  return <Ionicons name={iconName} size={size} color={color} />;
}
