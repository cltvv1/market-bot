import type { UserPlatform } from 'src/users/entities/user.entity';

export interface ClientIdentity {
    platform: UserPlatform;
    chatId: string;
    username?: string;
    name?: string;
    organizationId?: number;
}

export interface ClientFlowResult<T = unknown> {
    status: 'started' | 'continued' | 'completed' | 'not_found' | 'already_open';
    message: string;
    nextField?: string;
    data?: T;
}

export interface StartSimpleServiceRequestInput extends ClientIdentity {
    serviceTypeCode: SimpleServiceRequestCode;
}

export type SimpleServiceRequestCode = 'firmware_update' | 'kkt_remote_work';
