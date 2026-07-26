import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
    createTypeOrmOptions,
    readApplicationDatabaseConfig,
} from './database-options';

export default new DataSource(
    createTypeOrmOptions(readApplicationDatabaseConfig(), __dirname),
);
