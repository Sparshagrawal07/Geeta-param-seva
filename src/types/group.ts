export interface Group {
  id: string;
  name: string;
  description?: string;
  /** True when a join PIN has been configured (hash stored server-side). */
  hasPin?: boolean;
  /** When the current join PIN expires (server-set; no plaintext). */
  pinExpiresAt?: Date | null;
  memberCount?: number;
  postCount?: number;
  pollCount?: number;
  todaysPollResponseCount?: number;
  createdAt: Date;
  createdBy: string;
}
