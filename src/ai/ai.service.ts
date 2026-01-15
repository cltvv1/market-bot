import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import GigaChat from 'gigachat';
import { Agent } from 'node:https';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private gigachat: GigaChat;

    constructor(private readonly configService: ConfigService) {
        this.gigachat = new GigaChat({
            credentials: this.configService.get<string>('GIGACHAT_CLIENT_SECRET'),
            scope: 'GIGACHAT_API_PERS',
        });
    }

    async askQuestion(question: string): Promise<string> {
        if (!question?.trim()) {
            return 'Вопрос пуст.';
        }

        try {
            const httpsAgent = new Agent({
                rejectUnauthorized: false,
            });
            const response = await this.gigachat.chat({
                model: 'GigaChat-2-Max',
                messages: [
                    {
                        role: 'system',
                        content: 'Ты помощник Telegram-бота фирмы, которая торгует кассовым оборудованием на маркетплейсах.',
                    },
                    {
                        role: 'user',
                        content: question,
                    },
                ],
                temperature: 0.7,
                max_tokens: 500,
                httpsAgent: httpsAgent
            });

            return response.choices?.[0]?.message?.content
                ?? 'Ответ не получен.';
        } catch (error) {
            this.logger.error('GigaChat error', error);
            return 'Ошибка при обращении к AI.';
        }
    }
}
