import * as fs from 'fs';
import * as path from 'path';
import PdfPrinter from 'pdfmake';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationRequestEntity } from '../registrations/entities/registration.entity';
import { RegistrationFieldEntity } from '../registrations/entities/registration-field.entity';

@Injectable()
export class PdfGeneratorService {
    private readonly pdfDir: string;



    constructor(
        private configService: ConfigService,
    ) {
        this.pdfDir = this.configService.get<string>('PDF_DIR')!;
    }

    private fonts = {
        Roboto: {
            normal: path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-Regular.ttf'),
            bold: path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-Bold.ttf'),
            italics: path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-Italic.ttf'),
            bolditalics: path.join(__dirname, '..', '..', 'src', 'fonts', 'Roboto-BoldItalic.ttf'),
        }
    };

    async generateRegistrationPdf(
        request: RegistrationRequestEntity,
        fields: RegistrationFieldEntity[],
    ): Promise<string> {

        const printer = new PdfPrinter(this.fonts);

        const tableBody = [
            [
                { text: 'Поле', style: 'tableHeader' },
                { text: 'Значение', style: 'tableHeader' }
            ]
        ];

        for (const f of fields.sort((a, b) => a.step - b.step)) {
            const value = (request as any)[f.name] ?? '—';
            tableBody.push([
                { text: f.label, style: 'tableCell' },
                { text: String(value), style: 'tableCell' }
            ]);
        }

        const docDefinition = {
            content: [
                { text: `Заявка на регистрацию №${request.id} ${request.orgName}`, style: 'header', margin: [0, 0, 0, 20] },

                {
                    table: {
                        widths: ['*', '*'],
                        body: tableBody
                    }
                },

                { text: `Создано: ${request.createdAt.toLocaleDateString()}`, margin: [0, 20, 0, 0] }
            ],

            styles: {
                header: {
                    fontSize: 18,
                    bold: true
                },
                tableHeader: {
                    bold: true,
                    fillColor: '#eeeeee',
                    fontSize: 12,
                    margin: [3, 3, 3, 3]
                },
                tableCell: {
                    fontSize: 11,
                    margin: [3, 3, 3, 3]
                }
            }
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        const filePath = path.join(process.cwd(), this.pdfDir, `registration_${request.id}.pdf`);
        const writeStream = fs.createWriteStream(filePath);

        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        await new Promise<void>((resolve) => {
            writeStream.on('finish', () => resolve());
        });

        return filePath;
    }
}
