import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerActivityEntity, CustomerActivityType } from './entities/customer-activity.entity';
import type { UserPlatform } from 'src/users/entities/user.entity';

interface AddActivityInput {
    userId?: number;
    organizationId?: number;
    platform: UserPlatform;
    chatId: string;
    type: CustomerActivityType;
    title?: string;
    description?: string;
    ticketId?: number;
    serviceRequestId?: number;
    payload?: Record<string, unknown>;
}

@Injectable()
export class CustomerActivityService {
    constructor(
        @InjectRepository(CustomerActivityEntity)
        private readonly activityRepo: Repository<CustomerActivityEntity>,
    ) { }

    add(input: AddActivityInput) {
        return this.activityRepo.save(this.activityRepo.create({
            userId: input.userId,
            organizationId: input.organizationId,
            platform: input.platform,
            chatId: input.chatId,
            type: input.type,
            title: input.title ?? null,
            description: input.description ?? null,
            ticketId: input.ticketId,
            serviceRequestId: input.serviceRequestId,
            payload: input.payload ?? null,
        }));
    }

    listForContext(userId?: number, organizationId?: number) {
        return this.activityRepo.find({
            where: [
                ...(userId ? [{ userId }] : []),
                ...(organizationId ? [{ organizationId }] : []),
            ],
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }
}
