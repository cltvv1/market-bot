import { TG_TEXTS } from "src/texts/telegram.texts";
import { Markup } from "telegraf";

export function startRegButtons() {
    return Markup.keyboard(
        [
            Markup.button.text(TG_TEXTS.START_REG_TEXT),
            Markup.button.text(TG_TEXTS.STOP_REG_TEXT)
        ],
        {
            columns: 1
        }
    ).resize()
}
