import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'src/files/files.module';
import { MessengerModule } from 'src/messenger/messenger.module';
import { OutboundDeliveryEntity } from './entities/outbound-delivery.entity';
import { OutboundDeliveryProcessor } from './outbound-delivery.processor';
import { OutboundDeliveriesService } from './outbound-deliveries.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([OutboundDeliveryEntity]),
        FilesModule,
        MessengerModule,
    ],
    providers: [OutboundDeliveriesService, OutboundDeliveryProcessor],
    exports: [OutboundDeliveriesService, OutboundDeliveryProcessor],
})
export class OutboundDeliveriesModule {}
