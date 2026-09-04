export interface UserDevice {
  id: string;
  token: string;
  enabled: boolean;
  platform?: string;
  updatedAt?: Date;
}
