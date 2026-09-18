import { forwardRef, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { useLocale } from '@/providers/locale-provider';

interface AppTextFieldProps extends TextInputProps {
  label: string;
  helperText?: string;
  errorText?: string;
  /** Fixed left adornment inside the field (e.g. country code). */
  prefix?: ReactNode;
}

export const AppTextField = forwardRef<TextInput, AppTextFieldProps>(function AppTextField(
  { label, helperText, errorText, prefix, className, ...props },
  ref
) {
  const { placeholder, destructiveText } = useAppColors();
  const { locale } = useLocale();
  const helperMessage = errorText ?? helperText;
  const fontStyle =
    locale === 'hi'
      ? { fontFamily: 'NotoSansDevanagari_400Regular' as const, includeFontPadding: true }
      : { includeFontPadding: true };

  const input = (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholder}
      className={
        prefix
          ? `min-w-0 flex-1 py-3 pl-3 pr-4 text-base leading-6 text-gp-text dark:text-gp-text-dark ${className ?? ''}`
          : `rounded-lg border border-gp-border bg-gp-card px-4 py-3 text-base leading-6 text-gp-text dark:border-gp-border-dark dark:bg-gp-card-dark dark:text-gp-text-dark ${className ?? ''}`
      }
      style={fontStyle}
      {...props}
    />
  );

  return (
    <View className="gap-2">
      <AppText className="text-sm leading-5 text-gp-muted dark:text-gp-muted-dark">{label}</AppText>
      {prefix ? (
        <View className="flex-row items-center overflow-hidden rounded-lg border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
          <View className="border-r border-gp-border bg-gp-notice px-3 py-3 dark:border-gp-border-dark dark:bg-gp-notice-dark">
            {typeof prefix === 'string' ? (
              <AppText bold className="text-base leading-6 text-gp-text dark:text-gp-text-dark">
                {prefix}
              </AppText>
            ) : (
              prefix
            )}
          </View>
          {input}
        </View>
      ) : (
        input
      )}
      {helperMessage ? (
        <AppText
          className="text-sm leading-6"
          style={{ color: errorText ? destructiveText : placeholder }}>
          {helperMessage}
        </AppText>
      ) : null}
    </View>
  );
});
