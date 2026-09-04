export interface SevaBanner {
  backgroundColor: string;
  /** Multiplier applied to auto-sized banner text (0.7–1.4) */
  textScale: number;
  salutation: string;
  serviceLine: string;
  name: string;
  gotra: string;
  age: string;
  location: string;
}

export interface SevaPost {
  id: string;
  type: 'seva';
  groupId: string;
  title: string;
  description: string;
  banner?: SevaBanner;
  /** @deprecated Legacy posts only */
  imageUrl?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface AnnouncementPost {
  id: string;
  type: 'announcement';
  groupId: string;
  title: string;
  message: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export type PostType = 'seva' | 'announcement';
export type FeedItem = SevaPost | AnnouncementPost;

export interface AppNotification {
  id: string;
  groupId: string;
  title: string;
  body: string;
  createdAt: Date;
}
