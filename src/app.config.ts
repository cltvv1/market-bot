import * as Joi from 'joi';

export const validationSchema = Joi.object({
    BOT_TOKEN: Joi.string().required(),
    PDF_DIR: Joi.string().default('storage/registrations'),
    CONSENT_DIR: Joi.string().default('storage/consents'),
    DB_HOST: Joi.string().default('localhost'),
    DB_PORT: Joi.number().port().default(5432),
    DB_NAME: Joi.string().default('db'),
    DB_USER: Joi.string().default('user'),
    DB_PASS: Joi.string().default('pass'),
    MAX_BOT_TOKEN: Joi.string().optional(),
    ADMIN_TOKEN: Joi.string().optional(),
    ADMIN_NAME: Joi.string().optional(),
    ADMIN_USERS: Joi.string().optional(),
    ADMIN_LOGIN: Joi.string().optional(),
    ADMIN_PASSWORD: Joi.string().optional(),
    ADMIN_SESSION_DAYS: Joi.number().integer().min(1).default(180),
});
