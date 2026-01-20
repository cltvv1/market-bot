import * as Joi from 'joi';

export const validationSchema = Joi.object({
    BOT_TOKEN: Joi.string().required(),
    PDF_DIR: Joi.string().default('storage/registrations'),
});