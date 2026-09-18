import { View } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';

interface LotusDividerProps {
  className?: string;
  /** hero = slightly taller presence under home greeting */
  variant?: 'default' | 'hero';
}

export function LotusDivider({ className, variant = 'default' }: LotusDividerProps) {
  return (
    <View
      className={`w-full items-center ${className ?? 'my-4'}`}
      style={variant === 'hero' ? { marginVertical: 10 } : undefined}>
      <SpiritualAssetImage
        slot="lotusDivider"
        style={variant === 'hero' ? { maxWidth: 280, height: 24 } : undefined}
      />
    </View>
  );
}
