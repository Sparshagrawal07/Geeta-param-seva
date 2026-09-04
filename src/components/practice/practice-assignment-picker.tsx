import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import {
  REQUIRED_ADHYAY_COUNT,
  buildAdhyayItem,
  buildAartiItem,
  type PracticeItem,
} from '@/lib/practice';
import { useLocale } from '@/providers/locale-provider';

interface PracticeAssignmentPickerProps {
  value: PracticeItem[];
  onChange: (items: PracticeItem[]) => void;
}

const CHAPTERS = Array.from({ length: 18 }, (_, i) => i + 1);

export function PracticeAssignmentPicker({ value, onChange }: PracticeAssignmentPickerProps) {
  const { t } = useLocale();
  const colors = useAppColors();

  const selectedChapters = value
    .filter((item) => item.type === 'adhyay')
    .map((item) => Number(item.chapterNumber))
    .filter((n) => n >= 1 && n <= 18);
  const aartiSelected = value.some((item) => item.type === 'aarti');

  const emit = (chapters: number[], includeAarti: boolean) => {
    const items: PracticeItem[] = chapters.map((chapter) => buildAdhyayItem(chapter));
    if (includeAarti) items.push(buildAartiItem());
    onChange(items);
  };

  const toggleChapter = (chapter: number) => {
    void triggerHaptic('selection');
    if (selectedChapters.includes(chapter)) {
      emit(
        selectedChapters.filter((c) => c !== chapter),
        aartiSelected
      );
      return;
    }
    if (selectedChapters.length >= REQUIRED_ADHYAY_COUNT) {
      // Replace the oldest selection with the new chapter.
      emit([selectedChapters[1]!, chapter], aartiSelected);
      return;
    }
    emit([...selectedChapters, chapter], aartiSelected);
  };

  const toggleAarti = () => {
    void triggerHaptic('selection');
    emit(selectedChapters, !aartiSelected);
  };

  return (
    <View className="gap-4 p-4">
      <View>
        <AppText bold className="text-sm text-gp-text dark:text-gp-text-dark">
          {t('practicePickAdhyays')}
        </AppText>
        <AppText className="mt-1 text-xs text-gp-muted dark:text-gp-muted-dark">
          {t('practicePickAdhyaysHint')}
        </AppText>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {CHAPTERS.map((chapter) => {
            const active = selectedChapters.includes(chapter);
            return (
              <Pressable
                key={chapter}
                onPress={() => toggleChapter(chapter)}
                className={`min-w-[52px] items-center rounded-xl border px-3 py-2 ${
                  active
                    ? 'border-saffron bg-saffron/10 dark:border-gold dark:bg-gold/10'
                    : 'border-gp-border bg-gp-bg dark:border-gp-border-dark dark:bg-gp-bg-dark'
                }`}>
                <AppText
                  bold
                  className={active ? 'text-saffron dark:text-gold' : 'text-gp-text dark:text-gp-text-dark'}>
                  {chapter}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText className="mt-2 text-xs text-gp-muted dark:text-gp-muted-dark">
          {selectedChapters.length}/{REQUIRED_ADHYAY_COUNT} {t('practiceAdhyaysSelected')}
        </AppText>
      </View>

      <Pressable
        onPress={toggleAarti}
        className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${
          aartiSelected
            ? 'border-saffron bg-saffron/10 dark:border-gold dark:bg-gold/10'
            : 'border-gp-border bg-gp-bg dark:border-gp-border-dark dark:bg-gp-bg-dark'
        }`}>
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            aartiSelected ? 'bg-saffron/15 dark:bg-gold/15' : 'bg-gp-card dark:bg-gp-card-dark'
          }`}>
          <Ionicons name="flame-outline" size={20} color={aartiSelected ? colors.saffron : colors.placeholder} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText
            bold
            className={aartiSelected ? 'text-saffron dark:text-gold' : 'text-gp-text dark:text-gp-text-dark'}>
            {t('practiceAartiOptional')}
          </AppText>
          <AppText className="mt-0.5 text-sm text-gp-muted dark:text-gp-muted-dark">
            {t('practiceAartiOptionalHint')}
          </AppText>
        </View>
        {aartiSelected ? <Ionicons name="checkmark-circle" size={22} color={colors.saffron} /> : null}
      </Pressable>
    </View>
  );
}
