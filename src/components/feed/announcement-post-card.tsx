import { View } from 'react-native';

import { FeedPostContainer } from '@/components/feed/feed-post-container';
import { AppText } from '@/components/ui/app-text';
import { TranslatedAppText } from '@/components/ui/translated-app-text';
import { formatFeedDateTime } from '@/lib/format';
import { useLocale } from '@/providers/locale-provider';
import type { AnnouncementPost } from '@/types/feed';

interface AnnouncementPostCardProps {
  post: AnnouncementPost;
  deletable?: boolean;
  deleteActive?: boolean;
  onShowDelete?: (position: { x: number; y: number }) => void;
  reportable?: boolean;
  onReport?: () => void;
}

export function AnnouncementPostCard({
  post,
  deletable = false,
  deleteActive = false,
  onShowDelete,
  reportable = false,
  onReport,
}: AnnouncementPostCardProps) {
  const { t, locale } = useLocale();
  const author = post.createdByName.trim() || t('defaultAdminName');

  return (
    <FeedPostContainer
      deletable={deletable}
      deleteActive={deleteActive}
      onShowDelete={onShowDelete}
      reportable={reportable}
      onReport={onReport}>
      <View className="rounded-2xl border border-gp-border bg-gp-card p-4 dark:border-gp-border-dark dark:bg-gp-card-dark">
        <AppText className="pr-10 text-xs leading-5 text-gp-muted dark:text-gp-muted-dark">
          {t('postedBy').replace('{name}', author)} · {formatFeedDateTime(post.createdAt, locale)}
        </AppText>
        <TranslatedAppText bold className="mt-2 text-lg text-saffron dark:text-saffron-light">
          {post.title}
        </TranslatedAppText>
        <TranslatedAppText className="mt-2 text-base leading-7 text-gp-text dark:text-gp-text-dark">
          {post.message}
        </TranslatedAppText>
      </View>
    </FeedPostContainer>
  );
}
