import { Injectable } from '@nestjs/common';
import type { UserPlatform } from 'src/users/entities/user.entity';

export type UserMode = 'IDLE' | 'REGISTER' | 'TICKET' | 'OPERATOR' | 'BID' | 'SERVICE_REQUEST';

interface UserContext {
    mode: UserMode;
    talkingTo?: string | null;
    serviceRequestId?: number | null;
}

@Injectable()
export class UserContextService {
    private contexts = new Map<string, UserContext>();

    get(chatId: string, platform: UserPlatform = 'telegram'): UserContext {
        return this.contexts.get(this.getKey(chatId, platform)) || { mode: 'IDLE' };
    }

    set(chatId: string, context: Partial<UserContext>, platform: UserPlatform = 'telegram') {
        const existing = this.get(chatId, platform);
        this.contexts.set(this.getKey(chatId, platform), { ...existing, ...context });
    }

    reset(chatId: string, platform: UserPlatform = 'telegram') {
        this.contexts.set(this.getKey(chatId, platform), { mode: 'IDLE' });
    }

    private getKey(chatId: string, platform: UserPlatform) {
        return `${platform}:${chatId}`;
    }
}
