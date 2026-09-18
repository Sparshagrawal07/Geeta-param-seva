import { Image, View } from 'react-native';

import { FeedPostContainer } from '@/components/feed/feed-post-container';
import { SevaBannerView } from '@/components/seva/seva-banner-view';
import { AppText } from '@/components/ui/app-text';
import { TranslatedAppText } from '@/components/ui/translated-app-text';
import { formatFeedDateTime } from '@/lib/format';
import { useLocale } from '@/providers/locale-provider';
import type { SevaPost } from '@/types/feed';

interface SevaPostCardProps {
  post: SevaPost;
  deletable?: boolean;
  deleteActive?: boolean;
  onShowDelete?: (position: { x: number; y: number }) => void;
  reportable?: boolean;
  onReport?: () => void;
}

export function SevaPostCard({
  post,
  deletable = false,
  deleteActive = false,
  onShowDelete,
  reportable = false,
  onReport,
}: SevaPostCardProps) {
  const { t, locale } = useLocale();
  const author = post.createdByName.trim() || t('defaultAdminName');

  return (
    <FeedPostContainer
      deletable={deletable}
      deleteActive={deleteActive}
      onShowDelete={onShowDelete}
      reportable={reportable}
      onReport={onReport}>
      <View className="overflow-hidden rounded-2xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
        {post.banner ? (
          <SevaBannerView banner={post.banner} />
        ) : post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
        ) : null}

        <View className="gap-2 p-4">
          <AppText className="pr-10 text-xs leading-5 text-gp-muted dark:text-gp-muted-dark">
            {t('postedBy').replace('{name}', author)} · {formatFeedDateTime(post.createdAt, locale)}
          </AppText>
          <TranslatedAppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
            {post.title}
          </TranslatedAppText>
          {post.description ? (
            <TranslatedAppText className="text-base leading-7 text-gp-text dark:text-gp-text-dark">
              {post.description}
            </TranslatedAppText>
          ) : null}
        </View>
      </View>
    </FeedPostContainer>
  );
}
