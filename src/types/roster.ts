export type RosterRole = 'user' | 'admin';
export type RosterStatus = 'active' | 'inactive';

export interface AccessRosterEntry {
  id: string;
  name: string;
  phoneNumber: string;
  role: RosterRole;
  /** Member's single group */
  groupId?: string | null;
  /** Admin's assigned groups */
  assignedGroupIds?: string[];
  status: RosterStatus;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
