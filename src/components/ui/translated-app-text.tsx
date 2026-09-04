import { AppText, type AppTextProps } from '@/components/ui/app-text';
import { useTranslatedText } from '@/hooks/use-translated-content';

interface TranslatedAppTextProps extends AppTextProps {
  children: string;
}

export function TranslatedAppText({ children, ...props }: TranslatedAppTextProps) {
  const text = useTranslatedText(children);
  return <AppText {...props}>{text}</AppText>;
}
