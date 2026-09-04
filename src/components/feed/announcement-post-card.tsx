import { View } from 'react-native';

import { FeedPostContainer } from '@/components/feed/feed-post-container';
import { AppText } from '@/components/ui/app-text';
import { TranslatedAppText } from '@/components/ui/translated-app-text';
import { formatDateTime } from '@/lib/format';
import { useLocale } from '@/providers/locale-provider';
import type { AnnouncementPost } from '@/types/feed';

interface AnnouncementPostCardProps {
  post: AnnouncementPost;
  deletable?: boolean;
  deleteActive?: boolean;
  onShowDelete?: (position: { x: number; y: number }) => void;
}

export function AnnouncementPostCard({
  post,
  deletable = false,
  deleteActive = false,
  onShowDelete,
}: AnnouncementPostCardProps) {
  const { locale } = useLocale();

  return (
    <FeedPostContainer deletable={deletable} deleteActive={deleteActive} onShowDelete={onShowDelete}>
      <View className="rounded-xl border border-gp-border bg-gp-card p-4 dark:border-gp-border-dark dark:bg-gp-card-dark">
        <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
          {formatDateTime(post.createdAt, locale)} • {post.createdByName}
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
