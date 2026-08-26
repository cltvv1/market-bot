import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import dataSource from 'src/database/data-source';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import { FileLifecycleService } from 'src/files/file-lifecycle.service';
import { LocalFileStorageProvider } from 'src/files/local-file-storage.provider';
import { StoredFileReferenceInspector } from 'src/files/stored-file-reference-inspector';

const argumentsSet = new Set(process.argv.slice(2));
const supported = new Set(['--apply', '--verify-checksums']);
const unknown = [...argumentsSet].filter(
    (argument) => !supported.has(argument),
);
if (unknown.length) {
    throw new Error(
        `Unknown argument(s): ${unknown.join(', ')}. Supported: --apply, --verify-checksums`,
    );
}

void run();

async function run() {
    await dataSource.initialize();
    try {
        const config = new ConfigService(process.env);
        const storage = new LocalFileStorageProvider(config);
        const references = new StoredFileReferenceInspector(dataSource);
        const lifecycle = new FileLifecycleService(
            dataSource,
            dataSource.getRepository(StoredFileEntity),
            storage,
            config,
            references,
        );
        const report = await lifecycle.reconcile({
            apply: argumentsSet.has('--apply'),
            verifyChecksums: argumentsSet.has('--verify-checksums'),
        });
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        if (report.errors.length) process.exitCode = 1;
    } finally {
        await dataSource.destroy();
    }
}
