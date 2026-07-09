import * as fs from 'fs';
import * as path from 'path';
import PdfPrinter from 'pdfmake';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationRequestEntity } from '../registrations/entities/registration.entity';
import { RegistrationFieldEntity } from '../registrations/entities/registration-field.entity';

export interface AtolConsentPdfData {
    id: number;
    city?: string;
    clientName?: string;
    inn?: string;
    representativeName?: string;
    representativeBasis?: string;
}

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
            normal: path.join(__dirname, '..', '..', 'src', 'pdf', 'fonts', 'Roboto-Regular.ttf'),
            bold: path.join(__dirname, '..', '..', 'src', 'pdf', 'fonts', 'Roboto-Bold.ttf'),
            italics: path.join(__dirname, '..', '..', 'src', 'pdf', 'fonts', 'Roboto-Italic.ttf'),
            bolditalics: path.join(__dirname, '..', '..', 'src', 'pdf', 'fonts', 'Roboto-BoldItalic.ttf'),
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
            const value = (request as any)[f.name] ?? '-';
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
                { text: `Создано: ${request.createdAt.toLocaleDateString('ru-RU')}`, margin: [0, 20, 0, 0] }
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

    async generateAtolConsentPdf(consent: AtolConsentPdfData): Promise<string> {
        const printer = new PdfPrinter(this.fonts);
        const dir = path.join(process.cwd(), this.configService.get<string>('CONSENT_DIR') ?? 'storage/consents');
        await fs.promises.mkdir(dir, { recursive: true });

        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = this.getRussianMonthGenitive(today);
        const year = String(today.getFullYear());
        const clientName = consent.clientName || '____________________________';
        const inn = consent.inn || '________________';
        const representativeName = consent.representativeName || '____________________________';
        const basis = consent.representativeBasis || '____________________________';

        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [32, 30, 32, 28],
            defaultStyle: {
                font: 'Roboto',
                fontSize: 8.7,
                lineHeight: 1,
            },
            content: [
                { text: 'Согласие', style: 'title' },
                { text: 'на дистанционный доступ и дистанционное управление', style: 'titleLine' },
                { text: 'контрольно-кассовой техникой', style: 'titleLine', margin: [0, 0, 0, 16] },
                {
                    columns: [
                        { text: `г. ${consent.city || 'Красноярск'}`, width: '*' },
                        { text: `«${day}» ${month} ${year} г.`, width: 'auto', alignment: 'right' },
                    ],
                    margin: [0, 0, 0, 18],
                },
                {
                    text: [
                        { text: `${clientName} `, decoration: 'underline' },
                        { text: '(далее - Клиент), ИНН ' },
                        { text: `${inn}`, decoration: 'underline' },
                        { text: ',\nв лице ' },
                        { text: `${representativeName}`, decoration: 'underline' },
                        { text: ', действующего(ей) на основании ' },
                        { text: `${basis}`, decoration: 'underline' },
                        { text: ',' },
                    ],
                    margin: [0, 0, 0, 12],
                },
                {
                    text: 'подтверждает, что является владельцем контрольно-кассовой техники, изготовителем которой является Общество с ограниченной ответственностью «АТОЛ» (ИНН 5010051677) (далее - Кассы), дает свое согласие на доступ к данным Касс для целей дистанционного мониторинга и управления (далее - Согласие) на следующих условиях.',
                    margin: [0, 0, 0, 9],
                },
                { text: '1. Согласие распространяется на следующих лиц:', margin: [0, 0, 0, 4] },
                { text: 'Общество с ограниченной ответственностью «АТОЛ» (ИНН 5010051677)' },
                { text: 'Партнер ООО «АТОЛ» - ООО «ВИТМА-С» (ИНН 2466246780), код организации 1615.', margin: [0, 0, 0, 5] },
                { text: '2. Клиент дает согласие на дистанционный мониторинг и управление всеми Кассами, которые имеются у Клиента в настоящий момент и будут приобретены в будущем.', margin: [0, 0, 0, 4] },
                { text: '3. Согласие распространяется на следующие данные Касс и способы дистанционного управления ими:', margin: [0, 0, 0, 4] },
                {
                    ul: [
                        'Данные Касс - версия ФФД; версия протокола Кассы; версии используемого программного обеспечения; сведения о фискальном накопителе - номер, дата его активации и дата окончания срока действия, количество оставшихся перерегистраций; наименование, адрес и ИНН владельца; система налогообложения; регистрационный номер ККМ, флаг фискальности Кассы; напряжение батарейки в мВ; наименование ОФД; состояние смены; последние коды ошибок сети, ОФД и ФН; ресурсы ТПГ в метрах и резчика в отрезах; номер документа ФН; дата и время последнего соединения с ОФД и самого раннего документа, не отправленного в ОФД; тип используемого интерфейса для связи с хостом.',
                        'Способы дистанционного управления - дистанционное обновление программного обеспечения устройств и шаблонов чеков устройств, дистанционное конфигурирование устройств, получение уведомлений о состоянии устройств по СМС и на электронную почту и сводных ежемесячных отчетов по устройствам на электронную почту, дистанционная перезапись сертификатов на устройствах.',
                    ],
                    margin: [0, 0, 0, 4],
                },
                { text: '4. Настоящее Согласие не означает обязанностей со стороны лиц, упомянутых в п. 1 Согласия, организовывать мониторинг или управление и/или предоставлять Клиенту результаты вышеуказанных действий, для их получения требуется заключение отдельного договора.', margin: [0, 0, 0, 4] },
                { text: '5. Клиент дает согласие ООО «АТОЛ» на обработку данных с Касс, включая сбор, систематизацию, накопление, хранение, уточнение (обновление, изменение), использование, передачу. Указанные действия могут совершаться с использованием средств автоматизации.', margin: [0, 0, 0, 4] },
                { text: '6. Настоящее Согласие может быть отозвано в отношении ООО «АТОЛ» и/или указанного в п. 1 его партнера полностью (в отношении всех Касс) или частично (в отношении конкретных Касс) путем направления в адрес ООО «АТОЛ» соответствующего отзыва.', margin: [0, 0, 0, 10] },
                { text: 'Клиент', margin: [0, 0, 0, 5] },
                this.signatureLine('(наименование)'),
                this.signatureLine('(подпись)'),
                this.signatureLine('(расшифровка)', 0),
            ],
            styles: {
                title: {
                    alignment: 'center',
                    bold: true,
                    fontSize: 10.5,
                    margin: [0, 0, 0, 3],
                },
                titleLine: {
                    alignment: 'center',
                    bold: true,
                    fontSize: 10.5,
                    margin: [0, 0, 0, 2],
                },
            },
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const filePath = path.join(dir, `atol_consent_${consent.id}.pdf`);
        const writeStream = fs.createWriteStream(filePath);

        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        await new Promise<void>((resolve) => {
            writeStream.on('finish', () => resolve());
        });

        return filePath;
    }

    private getRussianMonthGenitive(date: Date) {
        return [
            'января',
            'февраля',
            'марта',
            'апреля',
            'мая',
            'июня',
            'июля',
            'августа',
            'сентября',
            'октября',
            'ноября',
            'декабря',
        ][date.getMonth()];
    }

    private signatureLine(label: string, bottomMargin = 4) {
        return {
            stack: [
                { text: '________________________________________', width: 210 },
                { text: label, fontSize: 7, alignment: 'center', width: 210, margin: [0, -2, 0, bottomMargin] },
            ],
            width: 210,
        };
    }
}
