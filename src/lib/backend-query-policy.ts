/** Hard bounds for senior-admin collection reads. */
export const GROUP_LIST_PAGE_SIZE = 100;
export const GROUP_LIST_MAX_PAGES = 5;
export const GROUP_LIST_MAX_DOCS = GROUP_LIST_PAGE_SIZE * GROUP_LIST_MAX_PAGES;

export const MEMBER_LIST_PAGE_SIZE = 200;
export const MEMBER_LIST_MAX_PAGES = 5;
export const MEMBER_LIST_MAX_DOCS = MEMBER_LIST_PAGE_SIZE * MEMBER_LIST_MAX_PAGES;

export const SENIOR_STATS_MAX_GROUPS = 250;
export const SENIOR_STATS_CACHE_MS = 5 * 60 * 1_000;

export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
