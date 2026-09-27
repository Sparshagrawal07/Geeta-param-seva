/**
 * Regression cover for "a member in more than one group sees no group at all".
 *
 * The member's screen builds its group list from these reads. A single group that
 * cannot be read used to reject the whole batch, which emptied the list and left
 * the member on the "no group assigned" screen despite their profile plainly
 * listing two groups — and left them unable to switch between their two groups.
 */

import { describe, expect, it } from 'vitest';

import { membershipIdsFor, mergeMembershipGroups } from '@/lib/group-membership-view';
import { collectReadableGroups } from '@/services/groups';
import type { Group } from '@/types/group';

const groupA = { id: 'grp_a', name: 'Alpha' };
const groupB = { id: 'grp_b', name: 'Beta' };

function fulfilled<T>(group: T | null) {
  return { status: 'fulfilled', value: { group } } as PromiseFulfilledResult<{ group: T | null }>;
}

function rejected(reason: string) {
  return { status: 'rejected', reason: new Error(reason) } as PromiseRejectedResult;
}

describe('collectReadableGroups', () => {
  it('returns every group when all of them load', () => {
    const result = collectReadableGroups([fulfilled(groupA), fulfilled(groupB)]);
    expect(result).toEqual([groupA, groupB]);
  });

  it('keeps the readable groups when one group cannot be read', () => {
    const result = collectReadableGroups([fulfilled(groupA), rejected('PERMISSION_DENIED')]);
    expect(result).toEqual([groupA]);
  });

  it('is empty only when every group failed', () => {
    const result = collectReadableGroups([rejected('DENIED'), rejected('DENIED')]);
    expect(result).toEqual([]);
  });

  it('drops groups that no longer exist without treating them as failures', () => {
    const result = collectReadableGroups([fulfilled(groupA), fulfilled(null)]);
    expect(result).toEqual([groupA]);
  });
});

function loaded(id: string, name: string, order: number): Group {
  return { id, name, createdAt: new Date(order), createdBy: 'admin' };
}

describe('mergeMembershipGroups', () => {
  it('keeps every group a member belongs to when one document fails to load', () => {
    // Only grp_a's document came back. The member is still in both groups, and the
    // switcher only appears when it can see two — so dropping grp_b here left the
    // member with no way to reach it.
    const { groups } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha', 1)],
      ['grp_a', 'grp_b']
    );

    expect(groups.map((g) => g.id)).toEqual(['grp_a', 'grp_b']);
  });

  it('uses the name the server stamped when the document cannot be read', () => {
    // The whole point of stamping names on the profile: a group the client cannot
    // read must still show its real name, not a placeholder.
    const { groups, unnamedGroupIds } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha', 1)],
      ['grp_a', 'grp_b'],
      { grp_b: 'Beta' }
    );

    expect(groups.find((g) => g.id === 'grp_b')?.name).toBe('Beta');
    expect(unnamedGroupIds).toEqual([]);
  });

  it('prefers a freshly read document over the stamped name', () => {
    const { groups } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha Renamed', 1)],
      ['grp_a'],
      { grp_a: 'Alpha' }
    );

    expect(groups[0]?.name).toBe('Alpha Renamed');
  });

  it('never labels a group with its raw document id', () => {
    const { groups } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha', 1)],
      ['grp_a', 'grp_b'],
      {},
      'Group (details unavailable)'
    );

    // The unreadable group is still offered, but by a readable label.
    expect(groups.find((g) => g.id === 'grp_b')?.name).toBe('Group (details unavailable)');
    expect(groups.map((g) => g.name)).not.toContain('grp_b');
  });

  it('reports only the groups that have no name from any source', () => {
    const { unnamedGroupIds } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha', 1)],
      ['grp_a', 'grp_b', 'grp_c'],
      { grp_b: 'Beta' }
    );

    expect(unnamedGroupIds).toEqual(['grp_c']);
  });

  it('prefers the loaded document for the name', () => {
    const { groups } = mergeMembershipGroups(
      [loaded('grp_a', 'Alpha', 1), loaded('grp_b', 'Beta', 2)],
      ['grp_a', 'grp_b']
    );

    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Beta']);
    expect(groups.map((g) => g.id)).toEqual(['grp_a', 'grp_b']);
  });

  it('keeps the primary group first regardless of document dates', () => {
    // The server guarantees groupId === groupIds[0], so the primary must lead.
    const { groups } = mergeMembershipGroups(
      [loaded('grp_b', 'Beta', 1), loaded('grp_a', 'Alpha', 2)],
      ['grp_a', 'grp_b']
    );

    expect(groups.map((g) => g.id)).toEqual(['grp_a', 'grp_b']);
  });

  it('does not invent groups the account does not belong to', () => {
    const { groups } = mergeMembershipGroups([loaded('grp_a', 'Alpha', 1)], ['grp_a']);

    expect(groups.map((g) => g.id)).toEqual(['grp_a']);
  });

  it('still offers every membership when no document loaded at all', () => {
    const { groups } = mergeMembershipGroups([], ['grp_a', 'grp_b']);

    expect(groups.map((g) => g.id)).toEqual(['grp_a', 'grp_b']);
  });
});

describe('membershipIdsFor', () => {
  it('gives a member in two groups both ids — the switcher needs two to appear', () => {
    expect(
      membershipIdsFor({ role: 'user', groupId: 'grp_a', groupIds: ['grp_a', 'grp_b'] })
    ).toEqual(['grp_a', 'grp_b']);
  });

  it('falls back to the scalar groupId for a profile written before multi-group', () => {
    expect(membershipIdsFor({ role: 'user', groupId: 'grp_a' })).toEqual(['grp_a']);
  });

  it('uses assignedGroupIds for an admin, not their (empty) memberships', () => {
    expect(
      membershipIdsFor({ role: 'admin', groupIds: [], assignedGroupIds: ['grp_a', 'grp_b'] })
    ).toEqual(['grp_a', 'grp_b']);
  });

  it('drops duplicates and blank entries while keeping order', () => {
    expect(
      membershipIdsFor({ role: 'user', groupIds: ['grp_b', 'grp_a', 'grp_b', '  '] })
    ).toEqual(['grp_b', 'grp_a']);
  });

  it('is empty for a member with no groups at all', () => {
    expect(membershipIdsFor({ role: 'user', groupId: null, groupIds: [] })).toEqual([]);
  });
});
