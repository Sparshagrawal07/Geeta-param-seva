export type JoinApplicationStatus = 'pending' | 'rejected' | 'added';

export interface JoinApplication {
  id: string;
  name: string;
  phoneNumber: string;
  status: JoinApplicationStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
  reviewedBy?: string;
  reviewedAt?: string | null;
}
