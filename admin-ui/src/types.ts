export type Tab = 'registrations' | 'service' | 'tickets' | 'organizations' | 'equipment-kits' | 'staff' | 'audit';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type AdminRole = 'operator' | 'engineer' | 'sales_manager' | 'superadmin';

export interface Admin {
  id: number;
  login: string;
  displayName: string;
  roles: AdminRole[];
  permissions: string[];
  isActive: boolean;
  sessionId: number;
}
export interface Staff {
  id: number;
  login: string;
  displayName: string;
  roles: AdminRole[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}
export interface Summary { newRegistrations: number; activeServiceRequests: number; openTickets: number }
export interface NotificationSettings {
  notifyRegistrations: boolean;
  notifyTickets: boolean;
  notifyServiceRequests: boolean;
}

export interface BaseItem {
  id: number;
  createdAt: string;
  platform?: string;
  userId?: number;
  organizationId?: number;
  chatId?: string;
}

export interface Registration extends BaseItem {
  status?: string;
  priority?: Priority;
  isProcessed?: boolean;
  orgName?: string;
  innKpp?: string;
  ogrn?: string;
  urAdress?: string;
  kktAdress?: string;
  kktModel?: string;
  kktName?: string;
  phoneToCall?: string;
  phone?: string;
  email?: string;
  nds?: string;
  excise?: string;
  markirovka?: string;
  services?: string;
  strictReporting?: string;
  taxSystem?: string;
  bankReqs?: string;
  ofd?: string;
  pdfPath?: string;
  equipmentPhotoPath?: string;
  equipmentPhotoName?: string;
  equipmentKitId?: number;
}

export interface Ticket extends BaseItem {
  userChatId?: string;
  name?: string;
  username?: string;
  text?: string;
  isAnswered?: boolean;
}

export interface TicketMessage extends BaseItem {
  sender: string;
  text?: string;
  messageType?: string;
  localPath?: string;
  externalUrl?: string;
  fileName?: string;
}

export interface ServiceRequest extends BaseItem {
  serviceTypeTitle?: string;
  serviceTypeCode?: string;
  status: string;
  priority?: Priority;
  responsibleOperatorId?: string;
  executorName?: string;
  assignedEngineerId?: number;
  operatorComment?: string;
  calculatedPrice?: number;
  invoiceFileId?: string; paymentProofFileId?: number;
  answers?: Record<string, unknown>;
}

export interface ServiceEvent extends BaseItem {
  type: string;
  actor?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface CustomerCard {
  user?: Record<string, any>;
  organization?: Record<string, any>;
  organizations?: Array<Record<string, any>>;
  assets?: Record<string, any[]>;
  activities?: Array<Record<string, any>>;
  registrations?: Registration[];
  serviceRequests?: ServiceRequest[];
  tickets?: Ticket[];
}

export interface EquipmentKit extends BaseItem {
  status?: string;
  cashRegisterModel?: string;
  cashRegisterSerial?: string;
  fiscalDriveSerial?: string;
  ofdActivationCode?: string;
  marketplaceOrderId?: string;
  registrationRequestId?: number;
}
