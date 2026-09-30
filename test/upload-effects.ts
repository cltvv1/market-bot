import type { DataSource } from 'typeorm';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { TicketMessageEntity } from '../src/tickets/entities/ticket-message.entity';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';
import { ServiceRequestMessageEntity } from '../src/service-requests/entities/service-request-message.entity';
import { RegistrationEvidenceEntity } from '../src/registrations/entities/registration-evidence.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';

export async function uploadEffects(db: DataSource) {
    return Promise.all(
        [
            StoredFileEntity,
            TicketMessageEntity,
            ServiceRequestAttachmentEntity,
            ServiceRequestMessageEntity,
            RegistrationEvidenceEntity,
            OutboundDeliveryEntity,
        ].map((entity) => db.getRepository(entity).count()),
    );
}
