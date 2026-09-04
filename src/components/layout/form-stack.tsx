import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';

interface FormStackProps extends ViewProps {
  children: ReactNode;
}

/** Consistent vertical spacing for form sections */
export function FormStack({ children, className, style, ...props }: FormStackProps) {
  return (
    <View className={className} style={[{ gap: 16 }, style]} {...props}>
      {children}
    </View>
  );
}

interface FormSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Bordered card grouping for modern form layouts */
export function FormSection({ title, children, className }: FormSectionProps) {
  return (
    <View className={className}>
      {title ? (
        <AppText bold className="mb-2 px-1 text-xs uppercase tracking-wide text-gp-muted dark:text-gp-muted-dark">
          {title}
        </AppText>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
        {children}
      </View>
    </View>
  );
}

interface ButtonRowProps {
  children: ReactNode;
}

/** Equal-width buttons in a horizontal row */
export function ButtonRow({ children }: ButtonRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12 }}>
      {children}
    </View>
  );
}

interface ButtonRowItemProps {
  children: ReactNode;
}

export function ButtonRowItem({ children }: ButtonRowItemProps) {
  return <View style={{ flex: 1, minWidth: 0 }}>{children}</View>;
}

interface ListRowProps {
  children: ReactNode;
  action?: ReactNode;
}

/** Label/content on the left, action control aligned on the right */
export function ListRow({ children, action }: ListRowProps) {
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-gp-border bg-gp-card px-3 py-2.5 dark:border-gp-border-dark dark:bg-gp-card-dark">
      <View className="min-w-0 flex-1 gap-0.5">{children}</View>
      {action ? <View style={{ flexShrink: 0, paddingTop: 2 }}>{action}</View> : null}
    </View>
  );
}
