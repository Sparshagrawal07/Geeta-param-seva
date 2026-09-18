import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { SevaBannerEditorModal } from '@/components/seva/seva-banner-editor-modal';
import { SevaBannerView } from '@/components/seva/seva-banner-view';
import { FormSection, FormStack } from '@/components/layout/form-stack';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { SemanticText } from '@/components/ui/semantic-text';
import { AppTextField } from '@/components/ui/text-field';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useAppColors } from '@/hooks/use-app-colors';
import { useGroups } from '@/hooks/use-groups';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { useTransientMessage } from '@/hooks/use-transient-message';
import { hasSevaBannerContent } from '@/lib/seva-banner';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';
import { createAnnouncementPost, createSevaPost } from '@/services/feed';
import type { SevaBanner } from '@/types/feed';
import type { MessageKey } from '@/lib/i18n/messages';

type PostKind = 'seva' | 'announcement';

const KIND_CARDS: Array<{
  value: PostKind;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: 'seva', titleKey: 'postTypeSeva', subtitleKey: 'postTypeSevaHint', icon: 'heart-outline' },
  {
    value: 'announcement',
    titleKey: 'postTypeAnnouncement',
    subtitleKey: 'postTypeAnnouncementHint',
    icon: 'megaphone-outline',
  },
];

function KindRow({
  icon,
  title,
  subtitle,
  active,
  last,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  active: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const colors = useAppColors();

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${
        last ? '' : 'border-b border-saffron/10 dark:border-gold/15'
      } ${active ? 'bg-saffron/10' : ''}`}>
      <View
        className={`h-11 w-11 items-center justify-center rounded-full ${
          active ? 'bg-saffron/15' : 'bg-gp-bg dark:bg-gp-bg-dark'
        }`}>
        <Ionicons name={icon} size={22} color={active ? colors.saffron : colors.placeholder} />
      </View>
      <View className="min-w-0 flex-1">
        <AppText bold className={active ? 'text-saffron' : 'text-gp-text dark:text-gp-text-dark'}>
          {title}
        </AppText>
        <AppText className="mt-0.5 text-sm text-gp-muted dark:text-gp-muted-dark">{subtitle}</AppText>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.saffron} /> : null}
    </Pressable>
  );
}

export default function AdminCreatePostScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const { groups } = useGroups();
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);

  const [kind, setKind] = useState<PostKind>('seva');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [sevaBanner, setSevaBanner] = useState<SevaBanner | null>(null);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { message: status, tone: statusTone, setProgress, showSuccess, clearMessage } =
    useTransientMessage();

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setMessage('');
    setSevaBanner(null);
  };

  const handlePublish = async () => {
    if (!profile || !selectedGroupId) {
      setError(t('selectGroup'));
      void triggerHaptic('warning');
      return;
    }

    if (!title.trim()) {
      setError(t('errorTitleRequired'));
      void triggerHaptic('warning');
      return;
    }

    if (kind === 'seva' && (!sevaBanner || !hasSevaBannerContent(sevaBanner))) {
      setError(t('errorBannerRequired'));
      void triggerHaptic('warning');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setProgress(t('publishing'));

      if (kind === 'seva' && sevaBanner) {
        await createSevaPost({
          groupId: selectedGroupId,
          title: title.trim(),
          description: description.trim(),
          banner: sevaBanner,
          createdBy: profile.uid,
          createdByName: profile.name,
        });
      }

      if (kind === 'announcement') {
        await createAnnouncementPost({
          groupId: selectedGroupId,
          title: title.trim(),
          message: message.trim(),
          createdBy: profile.uid,
          createdByName: profile.name,
        });
      }

      resetForm();
      showSuccess(t('publishedSuccess'));
      void triggerHaptic('success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('errorPublishFailed'));
      clearMessage();
      void triggerHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentClassName="relative px-5 pb-10 pt-2" animateContent={false}>
      <SectionHeader title={t('createPostTitle')} subtitle={t('createPostSubtitle')} />
      <SpiritualSurface variant="elevated">
        <SpiritualSurfaceBody className="py-4">
          <FormStack>
            <GroupScopeSelector
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={(id) => void setSelectedGroupId(id)}
              hint={groups.length > 1 ? t('createPostGroupHint') : undefined}
            />

            <FormSection title={t('createKindSection')}>
              {KIND_CARDS.map((card, index) => (
                <KindRow
                  key={card.value}
                  icon={card.icon}
                  title={t(card.titleKey)}
                  subtitle={t(card.subtitleKey)}
                  active={kind === card.value}
                  last={index === KIND_CARDS.length - 1}
                  onPress={() => {
                    if (kind !== card.value) {
                      void triggerHaptic('selection');
                    }
                    setKind(card.value);
                    clearMessage();
                    setError('');
                  }}
                />
              ))}
            </FormSection>

            <FormSection title={t('createContentSection')}>
              <View className="gap-4 p-4">
                <AppTextField
                  label={t('fieldTitle')}
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    if (error) setError('');
                    if (status) clearMessage();
                  }}
                  placeholder={t('titlePlaceholder')}
                />

                {kind === 'seva' ? (
                  <>
                    <AppTextField
                      label={t('fieldDescription')}
                      value={description}
                      onChangeText={setDescription}
                      placeholder={t('descriptionPlaceholder')}
                      multiline
                    />
                    <View className="gap-3">
                      <AppButton
                        label={sevaBanner ? t('editBanner') : t('createBanner')}
                        variant="secondary"
                        onPress={() => setBannerModalOpen(true)}
                      />
                      {sevaBanner ? (
                        <View className="overflow-hidden rounded-xl border border-saffron/15 dark:border-gold/20">
                          <SevaBannerView banner={sevaBanner} compact />
                        </View>
                      ) : (
                        <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                          {t('createBannerHint')}
                        </AppText>
                      )}
                    </View>
                  </>
                ) : null}

                {kind === 'announcement' ? (
                  <AppTextField
                    label={t('fieldMessage')}
                    value={message}
                    onChangeText={setMessage}
                    placeholder={t('messagePlaceholder')}
                    multiline
                  />
                ) : null}
              </View>
            </FormSection>

            {error ? <SemanticText tone="destructive">{error}</SemanticText> : null}
            {status ? (
              statusTone === 'success' ? (
                <SemanticText tone="success">{status}</SemanticText>
              ) : (
                <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{status}</AppText>
              )
            ) : null}

            <AppButton label={t('publish')} loading={loading} fullWidth onPress={() => void handlePublish()} />
          </FormStack>
        </SpiritualSurfaceBody>
      </SpiritualSurface>

      <SevaBannerEditorModal
        visible={bannerModalOpen}
        initialBanner={sevaBanner}
        onClose={() => setBannerModalOpen(false)}
        onDone={(banner) => {
          setSevaBanner(banner);
          setBannerModalOpen(false);
          setError('');
        }}
      />
    </Screen>
  );
}
