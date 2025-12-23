import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
    private openai: OpenAI;

    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
        });
    }

    async askQuestion(question: string): Promise<string> {
        if (!question) return 'Вопрос пустой.';
        console.log(process.env.OPENAI_API_KEY);
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Ты помощник в Telegram-боте техподдержки фирмы, которая продает кассовое оборудоване на маркетплейсе.' },
                    { role: 'user', content: question },
                ],
                temperature: 0.7,
                max_tokens: 500,
            });

            return response.choices[0].message?.content || 'Ответ пуст.';
        } catch (error) {
            console.error('OpenAI API error:', error);
            return 'Ошибка при обработке запроса.';
        }
    }
}
