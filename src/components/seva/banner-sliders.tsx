import Slider from '@react-native-community/slider';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import {
  CUSTOM_BANNER_LIGHTNESS,
  CUSTOM_BANNER_SATURATION,
  customBannerColorFromHue,
  hslToHex,
} from '@/lib/seva-banner';
import { triggerHaptic } from '@/lib/haptics';

const HUE_STOPS = 36;

interface BannerHueSliderProps {
  hue: number;
  onHueChange: (hue: number) => void;
}

export function BannerHueSlider({ hue, onHueChange }: BannerHueSliderProps) {
  const colors = useAppColors();
  const selectedColor = customBannerColorFromHue(hue);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: selectedColor,
            borderWidth: 2,
            borderColor: colors.gpBorder,
          }}
        />
        <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{selectedColor}</AppText>
      </View>

      <View
        style={{
          height: 24,
          borderRadius: 12,
          overflow: 'hidden',
          flexDirection: 'row',
        }}>
        {Array.from({ length: HUE_STOPS }, (_, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              backgroundColor: hslToHex(
                (index / HUE_STOPS) * 360,
                CUSTOM_BANNER_SATURATION,
                CUSTOM_BANNER_LIGHTNESS
              ),
            }}
          />
        ))}
      </View>

      <Slider
        value={hue}
        minimumValue={0}
        maximumValue={360}
        step={1}
        onValueChange={onHueChange}
        onSlidingComplete={() => void triggerHaptic('selection')}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor={selectedColor}
      />
    </View>
  );
}

interface BannerTextScaleSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumLabel: string;
  maximumLabel: string;
  valueLabel: string;
}

export function BannerTextScaleSlider({
  value,
  onValueChange,
  minimumLabel,
  maximumLabel,
  valueLabel,
}: BannerTextScaleSliderProps) {
  const colors = useAppColors();

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{minimumLabel}</AppText>
        <AppText bold className="text-sm text-gp-text dark:text-gp-text-dark">
          {valueLabel}
        </AppText>
        <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{maximumLabel}</AppText>
      </View>
      <Slider
        value={value}
        minimumValue={0.7}
        maximumValue={1.4}
        step={0.05}
        onValueChange={onValueChange}
        onSlidingComplete={() => void triggerHaptic('selection')}
        minimumTrackTintColor={colors.saffron}
        maximumTrackTintColor={colors.gpBorder}
        thumbTintColor={colors.saffron}
      />
    </View>
  );
}
