import { type TextProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';

type SemanticTone = 'destructive' | 'success';

interface SemanticTextProps extends TextProps {
  tone: SemanticTone;
}

export function SemanticText({ tone, style, ...props }: SemanticTextProps) {
  const colors = useAppColors();
  const color = tone === 'destructive' ? colors.destructiveText : colors.successText;

  return (
    <AppText
      className="w-full text-[15px] leading-6"
      style={[{ color }, style]}
      {...props}
    />
  );
}
