/**
 * Instant in-app + push notification when seva / announcement is published.
 * Invoked via callable after the client writes the post, and also by the
 * Firestore `onPostCreated` trigger as a reliability backstop.
 */
import { createAndPushGroupNotification } from './push';

export type CommunityPostNotifyType = 'seva' | 'announcement';

export async function notifyCommunityPostPublishedCore(input: {
  groupId: string;
  postType: CommunityPostNotifyType;
  /** Optional post title shown as the push body. */
  postTitle?: string;
  postId?: string;
}) {
  const groupId = input.groupId.trim();
  if (!groupId) {
    throw new Error('groupId is required.');
  }

  const postTitle = (input.postTitle ?? '').trim();
  const postId = input.postId?.trim();
  const idempotencyKey = postId ? `post_${postId}` : undefined;

  if (input.postType === 'seva') {
    return createAndPushGroupNotification({
      groupId,
      title: 'Seva is published',
      body: postTitle || 'New seva',
      type: 'seva',
      screen: 'feed',
      idempotencyKey,
      data: {
        screen: 'feed',
        ...(postId ? { postId } : {}),
        postType: 'seva',
      },
    });
  }

  return createAndPushGroupNotification({
    groupId,
    title: 'A message is published',
    body: postTitle || 'New group message',
    type: 'announcement',
    screen: 'feed',
    idempotencyKey,
    data: {
      screen: 'feed',
      ...(postId ? { postId } : {}),
      postType: 'announcement',
    },
  });
}
