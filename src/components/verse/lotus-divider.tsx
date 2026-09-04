import { View } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';

interface LotusDividerProps {
  className?: string;
  variant?: 'default' | 'hero';
}

export function LotusDivider({ className }: LotusDividerProps) {
  return (
    <View className={`my-4 w-full items-center ${className ?? ''}`}>
      <SpiritualAssetImage slot="lotusDivider" />
    </View>
  );
}
