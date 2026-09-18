import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { JoinPinRevealModal } from '@/components/admin/join-pin-reveal-modal';
import { Screen } from '@/components/layout/screen';
import { ButtonRow, ButtonRowItem, FormStack } from '@/components/layout/form-stack';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { FadeInView } from '@/components/ui/fade-in-view';
import { SemanticText } from '@/components/ui/semantic-text';
import { AppTextField } from '@/components/ui/text-field';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useGroups } from '@/hooks/use-groups';
import { useAuth } from '@/hooks/use-auth';
import { generateGroupJoinPinRemote, mapPinAuthError } from '@/lib/pin-auth';
import { createGroup, isGroupNameAvailable } from '@/services/groups';
import { triggerHaptic } from '@/lib/haptics';
import { isSeniorAdmin } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';

const SECTION_GAP = 24;

export default function GroupsScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const { groups, loading, error, refresh } = useGroups();

  const [showForm, setShowForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [revealedPin, setRevealedPin] = useState<{ pin: string; expiresAt: string; groupName: string } | null>(
    null
  );

  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: true });
    }, [refresh])
  );

  if (!isSeniorAdmin(profile?.role)) {
    return <Redirect href="/(admin)/(tabs)" />;
  }

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setFormError(t('errorGroupNameRequired'));
      void triggerHaptic('warning');
      return;
    }
    if (!profile) return;

    try {
      setCreating(true);
      setFormError('');
      const available = await isGroupNameAvailable(groupName.trim());
      if (!available) {
        setFormError(t('groupNameTaken'));
        void triggerHaptic('warning');
        return;
      }
      const group = await createGroup({
        name: groupName.trim(),
        description: groupDescription.trim(),
        createdBy: profile.uid,
      });
      const generated = await generateGroupJoinPinRemote({ groupId: group.id });
      setGroupName('');
      setGroupDescription('');
      setShowForm(false);
      setRevealedPin({
        pin: generated.pin,
        expiresAt: generated.expiresAt,
        groupName: group.name,
      });
      void triggerHaptic('success');
      void refresh({ silent: true });
    } catch (caught) {
      const mapped = mapPinAuthError(caught, t('groupCreateFailed'));
      setFormError(mapped);
      void triggerHaptic('error');
    } finally {
      setCreating(false);
    }
  };

  const pinStatusLabel = (group: { hasPin?: boolean; pinExpiresAt?: Date | null }) => {
    if (!group.hasPin) return t('groupPinMissing');
    if (group.pinExpiresAt && group.pinExpiresAt.getTime() > Date.now()) {
      return `${t('groupPinActiveUntil')} ${group.pinExpiresAt.toLocaleString()}`;
    }
    return t('groupPinExpired');
  };

  return (
    <Screen contentClassName="relative px-5 pb-10 pt-2" animateContent={false}>
      <SectionHeader title={t('groupsTitle')} subtitle={t('groupsSubtitle')} />

      {loading ? (
        <View className="items-center py-6">
          <AppSpinner size="md" />
        </View>
      ) : null}

      {error ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <ErrorState message={error} onRetry={() => void refresh()} />
        </View>
      ) : null}

      {!loading && !error && groups.length === 0 && !showForm ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <EmptyState title={t('noGroupsYet')} message={t('noGroupsMessage')} />
        </View>
      ) : null}

      {!loading && !error && groups.length > 0 ? (
        <View style={{ marginTop: SECTION_GAP, gap: 12 }}>
          {groups.map((group, index) => (
            <FadeInView key={group.id} index={index} slide>
              <Pressable onPress={() => router.push(`/(admin)/groups/${group.id}`)}>
                <SpiritualSurface variant="elevated">
                  <SpiritualSurfaceBody className="py-4">
                    <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
                      {group.name}
                    </AppText>
                    {group.description ? (
                      <AppText className="mt-1 text-sm text-gp-muted dark:text-gp-muted-dark">
                        {group.description}
                      </AppText>
                    ) : null}
                    <AppText className="mt-2 text-xs text-gp-muted dark:text-gp-muted-dark">
                      {pinStatusLabel(group)}
                    </AppText>
                  </SpiritualSurfaceBody>
                </SpiritualSurface>
              </Pressable>
            </FadeInView>
          ))}
        </View>
      ) : null}

      {showForm ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <SpiritualSurface variant="elevated">
            <SpiritualSurfaceBody className="py-4">
              <FormStack>
                <AppTextField
                  label={t('groupName')}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder={t('groupNamePlaceholder')}
                />
                <AppTextField
                  label={t('groupDescription')}
                  value={groupDescription}
                  onChangeText={setGroupDescription}
                  placeholder={t('groupDescriptionPlaceholder')}
                />
                <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                  {t('groupPinAutoGenerateHint')}
                </AppText>
                {formError ? <SemanticText tone="destructive">{formError}</SemanticText> : null}
                <ButtonRow>
                  <ButtonRowItem>
                    <AppButton
                      label={t('createGroup')}
                      loading={creating}
                      fullWidth
                      onPress={() => void handleCreate()}
                    />
                  </ButtonRowItem>
                  <ButtonRowItem>
                    <AppButton
                      label={t('cancel')}
                      variant="secondary"
                      fullWidth
                      onPress={() => {
                        setShowForm(false);
                        setFormError('');
                      }}
                    />
                  </ButtonRowItem>
                </ButtonRow>
              </FormStack>
            </SpiritualSurfaceBody>
          </SpiritualSurface>
        </View>
      ) : null}

      {!showForm ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <AppButton label={t('createGroup')} fullWidth onPress={() => setShowForm(true)} />
        </View>
      ) : null}

      {revealedPin ? (
        <JoinPinRevealModal
          visible
          pin={revealedPin.pin}
          expiresAt={revealedPin.expiresAt}
          groupName={revealedPin.groupName}
          onClose={() => setRevealedPin(null)}
        />
      ) : null}
    </Screen>
  );
}
