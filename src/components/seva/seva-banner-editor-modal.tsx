import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormSection, FormStack } from '@/components/layout/form-stack';
import { BannerHueSlider, BannerTextScaleSlider } from '@/components/seva/banner-sliders';
import { SevaBannerView } from '@/components/seva/seva-banner-view';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { AppTextField } from '@/components/ui/text-field';
import { SemanticText } from '@/components/ui/semantic-text';
import { useAppColors } from '@/hooks/use-app-colors';
import {
  BANNER_COLOR_PRESETS,
  clampBannerTextScale,
  createEmptySevaBanner,
  customBannerColorFromHue,
  hasSevaBannerContent,
  hexToHue,
  isPresetBannerColor,
} from '@/lib/seva-banner';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';
import type { SevaBanner } from '@/types/feed';

interface SevaBannerEditorModalProps {
  visible: boolean;
  initialBanner?: SevaBanner | null;
  onClose: () => void;
  onDone: (banner: SevaBanner) => void;
}

export function SevaBannerEditorModal({
  visible,
  initialBanner,
  onClose,
  onDone,
}: SevaBannerEditorModalProps) {
  const { t } = useLocale();
  const colors = useAppColors();
  const [draft, setDraft] = useState<SevaBanner>(() => createEmptySevaBanner());
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [customHue, setCustomHue] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      const next = initialBanner ? { ...initialBanner } : createEmptySevaBanner();
      setDraft(next);
      const isPreset = isPresetBannerColor(next.backgroundColor);
      setUseCustomColor(!isPreset);
      setCustomHue(hexToHue(next.backgroundColor));
      setError('');
    }
  }, [visible, initialBanner]);

  const updateField = <K extends keyof SevaBanner>(field: K, value: SevaBanner[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (error) {
      setError('');
    }
  };

  const selectPresetColor = (color: string) => {
    void triggerHaptic('selection');
    setUseCustomColor(false);
    updateField('backgroundColor', color);
  };

  const handleHueChange = (hue: number) => {
    setUseCustomColor(true);
    setCustomHue(hue);
    updateField('backgroundColor', customBannerColorFromHue(hue));
  };

  const handleTextScaleChange = (value: number) => {
    updateField('textScale', clampBannerTextScale(value));
  };

  const handleDone = () => {
    if (!hasSevaBannerContent(draft)) {
      setError(t('errorBannerEmpty'));
      return;
    }
    onDone(draft);
    void triggerHaptic('success');
  };

  const textScaleLabel = `${Math.round(draft.textScale * 100)}%`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-gp-border px-5 py-3 dark:border-gp-border-dark">
          <Pressable
            onPress={() => {
              void triggerHaptic('light');
              onClose();
            }}
            hitSlop={12}
            className="min-w-[64px]">
            <AppText className="text-base text-gp-muted dark:text-gp-muted-dark">{t('cancel')}</AppText>
          </Pressable>
          <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
            {t('bannerEditorTitle')}
          </AppText>
          <Pressable onPress={handleDone} hitSlop={12} className="min-w-[64px] items-end">
            <AppText bold className="text-base text-saffron">
              {t('done')}
            </AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <FormStack>
            <View className="items-center rounded-2xl border border-gp-border bg-gp-card p-4 dark:border-gp-border-dark dark:bg-gp-card-dark">
              <View style={{ width: '100%', maxWidth: 320 }}>
                <SevaBannerView banner={draft} />
              </View>
            </View>

            <FormSection title={t('bannerBackgroundColor')}>
              <View className="gap-4 p-4">
                <View className="flex-row flex-wrap gap-3">
                  {BANNER_COLOR_PRESETS.map((color) => {
                    const selected =
                      !useCustomColor && draft.backgroundColor.toUpperCase() === color.toUpperCase();
                    return (
                      <Pressable
                        key={color}
                        onPress={() => selectPresetColor(color)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: color,
                          borderWidth: selected ? 3 : 1,
                          borderColor: selected ? colors.saffron : 'rgba(0,0,0,0.15)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        {selected ? (
                          <AppText bold className="text-sm text-white">
                            ✓
                          </AppText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <View className="gap-2">
                  <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                    {t('bannerCustomColor')}
                  </AppText>
                  <BannerHueSlider hue={customHue} onHueChange={handleHueChange} />
                </View>

                <View className="gap-2">
                  <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                    {t('bannerTextSize')}
                  </AppText>
                  <BannerTextScaleSlider
                    value={draft.textScale}
                    onValueChange={handleTextScaleChange}
                    minimumLabel={t('bannerTextSizeSmall')}
                    maximumLabel={t('bannerTextSizeLarge')}
                    valueLabel={textScaleLabel}
                  />
                </View>
              </View>
            </FormSection>

            <FormSection title={t('bannerDetailsSection')}>
              <View className="gap-4 p-4">
                <AppTextField
                  label={t('bannerSalutation')}
                  value={draft.salutation}
                  onChangeText={(value) => updateField('salutation', value)}
                  placeholder={t('bannerSalutationPlaceholder')}
                />
                <AppTextField
                  label={t('bannerServiceLine')}
                  value={draft.serviceLine}
                  onChangeText={(value) => updateField('serviceLine', value)}
                  placeholder={t('bannerServiceLinePlaceholder')}
                />
                <AppTextField
                  label={t('bannerPersonName')}
                  value={draft.name}
                  onChangeText={(value) => updateField('name', value)}
                  placeholder={t('bannerPersonNamePlaceholder')}
                />
                <AppTextField
                  label={t('bannerGotra')}
                  value={draft.gotra}
                  onChangeText={(value) => updateField('gotra', value)}
                  placeholder={t('bannerGotraPlaceholder')}
                />
                <AppTextField
                  label={t('bannerAge')}
                  value={draft.age}
                  onChangeText={(value) => updateField('age', value)}
                  placeholder={t('bannerAgePlaceholder')}
                />
                <AppTextField
                  label={t('bannerLocation')}
                  value={draft.location}
                  onChangeText={(value) => updateField('location', value)}
                  placeholder={t('bannerLocationPlaceholder')}
                />
              </View>
            </FormSection>

            {error ? <SemanticText tone="destructive">{error}</SemanticText> : null}

            <AppButton label={t('done')} fullWidth onPress={handleDone} />
          </FormStack>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
