export type UserMode =
    | 'IDLE'
    | 'REGISTER'
    | 'TICKET'
    | 'OPERATOR'
    | 'SERVICE_REQUEST'
    | 'ATOL_CONSENT';

export interface UserContext {
    mode: UserMode;
    talkingTo?: string | null;
    serviceRequestId?: number | null;
}
