export type RosterRole = 'user' | 'admin';
export type RosterStatus = 'active' | 'inactive';

export interface AccessRosterEntry {
  id: string;
  name: string;
  phoneNumber: string;
  role: RosterRole;
  /** Member's primary group, mirroring `groupIds[0]` */
  groupId?: string | null;
  /** Member's groups — the multi-group source of truth */
  groupIds?: string[];
  /** Admin's assigned groups */
  assignedGroupIds?: string[];
  status: RosterStatus;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
