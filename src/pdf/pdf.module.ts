import { Module } from '@nestjs/common';
import { PdfGeneratorService } from './pdf.service';

@Module({
    providers: [PdfGeneratorService],
    exports: [PdfGeneratorService],
})
export class PdfModule { }
