import * as Joi from 'joi';

export const validationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'production')
        .default('development'),
    BOT_TOKEN: Joi.string().required(),
    BOT_POLLING_ENABLED: Joi.boolean().default(true),
    OUTBOUND_DELIVERY_WORKER_ENABLED: Joi.boolean().when('NODE_ENV', {
        is: 'test',
        then: Joi.boolean().default(false),
        otherwise: Joi.boolean().default(true),
    }),
    OUTBOUND_DELIVERY_POLL_INTERVAL_MS: Joi.number()
        .integer()
        .min(1000)
        .max(60000)
        .default(5000),
    FILE_STORAGE_ROOT: Joi.string().default('storage'),
    DB_HOST: Joi.string().trim().min(1).required(),
    DB_PORT: Joi.number().port().required(),
    DB_NAME: Joi.string().trim().min(1).required(),
    DB_USER: Joi.string().trim().min(1).required(),
    DB_PASS: Joi.string().trim().min(1).required(),
    TEST_DB_HOST: Joi.string().trim().min(1).optional(),
    TEST_DB_PORT: Joi.number().port().optional(),
    TEST_DB_NAME: Joi.when('NODE_ENV', {
        is: 'test',
        then: Joi.string().trim().min(1).required(),
        otherwise: Joi.string().trim().min(1).optional(),
    }),
    TEST_DB_USER: Joi.string().trim().min(1).optional(),
    TEST_DB_PASS: Joi.string().trim().min(1).optional(),
    MAX_BOT_TOKEN: Joi.string().allow('').optional(),
    ADMIN_SESSION_COOKIE_NAME: Joi.string()
        .trim()
        .min(1)
        .default('vitma_admin_session'),
    ADMIN_SESSION_TTL_HOURS: Joi.number().integer().min(1).max(720).default(12),
    WEB_SESSION_COOKIE_NAME: Joi.string()
        .trim()
        .min(1)
        .default('vitma_web_session'),
    WEB_SESSION_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),
    CORS_ORIGINS: Joi.string().allow('').optional(),
    TRUST_PROXY: Joi.number().integer().min(0).max(3).default(0),
    RATE_LIMIT_MAX_ENTRIES: Joi.number()
        .integer()
        .min(100)
        .max(100_000)
        .default(10_000),
    SWAGGER_ENABLED: Joi.boolean().optional(),
    HTTP_JSON_LIMIT: Joi.string()
        .pattern(/^\d+(kb|mb)$/i)
        .default('256kb'),
    HTTP_URLENCODED_LIMIT: Joi.string()
        .pattern(/^\d+(kb|mb)$/i)
        .default('64kb'),
    BACKUP_DIR: Joi.string().default('backups'),
    BACKUP_OFFLINE: Joi.boolean().default(false),
    SERVE_BUILT_UI: Joi.boolean().when('NODE_ENV', {
        is: 'production',
        then: Joi.boolean().default(true),
        otherwise: Joi.boolean().default(false),
    }),
    ADMIN_UI_DIST: Joi.string().default('admin-ui/dist'),
    CLIENT_UI_DIST: Joi.string().default('client-ui/dist'),
    INTEGRATION_BRIDGE_KEY: Joi.string().min(32).allow('').optional(),
    ATOL_BRIDGE_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .default('http://127.0.0.1:4318'),
    POFD_BRIDGE_URL: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .default('http://127.0.0.1:4319'),
}).unknown(true);
