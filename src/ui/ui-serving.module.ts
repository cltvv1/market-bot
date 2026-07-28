import { Global, Module } from '@nestjs/common';
import { UiServingService } from './ui-serving.service';

@Global()
@Module({
    providers: [UiServingService],
    exports: [UiServingService],
})
export class UiServingModule {}
