import { Injectable } from '@nestjs/common';

export type UserMode = 'IDLE' | 'REGISTER' | 'TICKET' | 'OPERATOR' | 'BID';

interface UserContext {
    mode: UserMode;
    talkingTo?: string | null;
}

@Injectable()
export class UserContextService {
    private contexts = new Map<string, UserContext>();

    get(chatId: string): UserContext {
        return this.contexts.get(chatId) || { mode: 'IDLE' };
    }

    set(chatId: string, context: Partial<UserContext>) {
        const existing = this.get(chatId);
        this.contexts.set(chatId, { ...existing, ...context });
    }

    reset(chatId: string) {
        this.contexts.set(chatId, { mode: 'IDLE' });
    }
}