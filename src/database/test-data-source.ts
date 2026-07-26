import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
    createTypeOrmOptions,
    readTestDatabaseConfig,
} from './database-options';

export default new DataSource(
    createTypeOrmOptions(readTestDatabaseConfig(), __dirname),
);
