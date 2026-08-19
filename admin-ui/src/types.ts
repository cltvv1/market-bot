// prettier-ignore
export type Tab = 'registrations' | 'service' | 'tickets' | 'opportunities' | 'organization-access' | 'organizations' | 'equipment-kits' | 'integrations' | 'staff' | 'audit';
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

// prettier-ignore
export interface ServiceRequest extends BaseItem {
  requestNumber?: string;
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
  customerStatus?: string;
  source?: string;
  version?: number;
  contactSnapshot?: Record<string, unknown>;
  organizationSnapshot?: Record<string, unknown>;
  locationSnapshot?: Record<string, unknown>;
  equipmentSnapshot?: Record<string, unknown>;
}

export interface ServiceEvent extends BaseItem {
  type: string;
  actor?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

// prettier-ignore
export interface ServiceMessage extends BaseItem {
  authorType: 'customer' | 'staff' | 'system';
  visibility: 'customer' | 'internal';
  text?: string;
}

// prettier-ignore
export interface ServiceAttachment extends BaseItem {
  kind: string;
  customerVisible: boolean;
  file: { id: number; originalName?: string; mimeType: string; sizeBytes: number };
}

// prettier-ignore
export interface CustomerCard {
  user?: { id: number; platform?: string; chatId?: string; name?: string; username?: string };
  organization?: { id: number; name?: string; inn?: string; kpp?: string };
  organizations?: Array<Record<string, any>>;
  assets?: {
    cashRegisters?: Array<{ id: number; model?: string; serialNumber: string; registrationNumber?: string }>;
    fiscalDrives?: Array<{ id: number; serialNumber: string; validUntil?: string }>;
    ofdSubscriptions?: Array<{ id: number; provider: string; validUntil?: string; status?: string }>;
  };
  contacts?: Array<{ id: number; kind: 'phone' | 'email'; rawValue: string; normalizedValue?: string; source: string }>;
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

export type OrganizationAccessStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface OrganizationAccessRequest extends BaseItem {
  status: OrganizationAccessStatus; requestedRole: 'representative'; submittedName?: string; submittedPhone?: string;
  submittedEmail?: string; comment?: string; reviewComment?: string; reviewedAt?: string; cancelledAt?: string;
  organization?: { id: number; name?: string; inn: string; kpp?: string };
  customer?: { id: number; name?: string; username?: string; platform: string; chatId: string };
  reviewer?: { id: number; displayName: string };
}

// prettier-ignore
export type OpportunityStatus = 'new' | 'in_progress' | 'contact_later' | 'converted' | 'resolved' | 'not_relevant';
// prettier-ignore
export interface ServiceOpportunity extends BaseItem {
  type: string; title: string; description?: string; priority: Priority; status: OpportunityStatus;
  serviceRequestId?: number; firstSeenAt: string; lastSeenAt: string; callbackAt?: string; operatorComment?: string;
  organization?: { id: number; name?: string; inn: string };
  cashRegister?: { id: number; model?: string; serialNumber: string; registrationNumber?: string };
  providers?: Array<'atol_connect' | 'platforma_ofd'>;
}
// prettier-ignore
export interface ExternalObservation extends BaseItem {
  provider: 'atol_connect' | 'platforma_ofd'; kind: string; title: string; description?: string; occurredAt: string;
}
// prettier-ignore
export interface OpportunityDetail {
  opportunity: ServiceOpportunity; observations: ExternalObservation[];
  organization?: { id: number; name?: string; inn?: string };
  cashRegister?: { id: number; model?: string; serialNumber?: string; registrationNumber?: string };
}
// prettier-ignore
export interface IntegrationRun extends BaseItem {
  provider: 'atol_connect' | 'platforma_ofd'; kind: string; mode: 'shadow' | 'apply';
  status: 'running' | 'succeeded' | 'partial' | 'failed'; receivedCount: number; appliedCount: number;
  skippedCount: number; errorCount: number; startedAt: string; finishedAt?: string; errorSummary?: string;
}
// prettier-ignore
export interface IntegrationBridgeState {
  ready: boolean; syncing?: boolean; lastSync?: string; lastError?: string; credentialsConfigured?: boolean; error?: string;
}
// prettier-ignore
export interface IntegrationExclusion extends BaseItem {
  inn: string; provider?: 'atol_connect' | 'platforma_ofd'; observationType?: string; reason?: string;
  isActive: boolean; updatedAt: string;
}
