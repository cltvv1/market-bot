export interface WebSessionPrincipal {
    sessionId: number;
    userId: number;
    chatId: string;
    platform: 'web';
    expiresAt: Date;
}
