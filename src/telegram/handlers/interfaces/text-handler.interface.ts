import { Context } from "telegraf";

export interface TextHandler {
    handle(ctx: Context, text: string): Promise<void>;
}
