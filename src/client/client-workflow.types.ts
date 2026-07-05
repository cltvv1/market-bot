import { BidType } from 'src/bids/bid.types';
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

export interface StartBidInput extends ClientIdentity {
    type: BidType;
}
