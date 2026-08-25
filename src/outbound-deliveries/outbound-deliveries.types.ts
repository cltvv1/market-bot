import type { EntityManager } from 'typeorm';
import type {
    OutboundDeliveryAudience,
    OutboundDeliveryKind,
    OutboundDeliveryPayload,
    OutboundDeliveryPlatform,
} from './entities/outbound-delivery.entity';

export interface EnqueueOutboundDeliveryInput {
    dedupeKey: string;
    platform: OutboundDeliveryPlatform;
    recipientChatId: string;
    kind: OutboundDeliveryKind;
    audience: OutboundDeliveryAudience;
    sourceType: string;
    sourceId: string | number;
    payload: OutboundDeliveryPayload;
    storedFileId?: number;
    nextAttemptAt?: Date;
}

export interface EnqueueOutboundDeliveryOptions {
    manager?: EntityManager;
}
