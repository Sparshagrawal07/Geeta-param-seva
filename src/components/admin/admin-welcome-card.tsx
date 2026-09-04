import { View } from 'react-native';

import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { VerseKrishnaBackdrop } from '@/components/verse/verse-krishna-backdrop';
import { AppText } from '@/components/ui/app-text';
import { LotusDivider } from '@/components/verse/lotus-divider';

interface AdminWelcomeCardProps {
  name: string;
  phone?: string;
  roleLabel: string;
  nameLabel: string;
  phoneLabel: string;
  roleFieldLabel: string;
}

/** Featured admin identity card with Krishna watermark (matches practice surfaces). */
export function AdminWelcomeCard({
  name,
  phone,
  roleLabel,
  nameLabel,
  phoneLabel,
  roleFieldLabel,
}: AdminWelcomeCardProps) {
  return (
    <SpiritualSurface variant="elevated" className="overflow-hidden">
      <SpiritualSurfaceBody className="relative overflow-hidden py-5">
        <VerseKrishnaBackdrop />
        <View className="relative z-[1] max-w-[72%] pr-2">
          <AppText bold className="text-xs uppercase tracking-widest text-saffron dark:text-gold">
            {roleFieldLabel}
          </AppText>
          <AppText bold className="mt-1 text-xl text-gp-text dark:text-gp-text-dark">
            {roleLabel}
          </AppText>
          <LotusDivider className="my-3" />
          <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">{nameLabel}</AppText>
          <AppText bold className="mt-0.5 text-base text-gp-text dark:text-gp-text-dark">
            {name}
          </AppText>
          {phone ? (
            <>
              <AppText className="mt-3 text-xs text-gp-muted dark:text-gp-muted-dark">{phoneLabel}</AppText>
              <AppText bold className="mt-0.5 text-base text-gp-text dark:text-gp-text-dark">
                {phone}
              </AppText>
            </>
          ) : null}
        </View>
      </SpiritualSurfaceBody>
    </SpiritualSurface>
  );
}
