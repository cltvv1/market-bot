import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFileEntity } from './entities/stored-file.entity';
import { FileLifecycleService } from './file-lifecycle.service';
import { FILE_STORAGE_PORT } from './file-storage.types';
import { FilesService } from './files.service';
import { LocalFileStorageProvider } from './local-file-storage.provider';
import { StoredFileReferenceInspector } from './stored-file-reference-inspector';

@Module({
    imports: [TypeOrmModule.forFeature([StoredFileEntity])],
    providers: [
        LocalFileStorageProvider,
        { provide: FILE_STORAGE_PORT, useExisting: LocalFileStorageProvider },
        FilesService,
        StoredFileReferenceInspector,
        FileLifecycleService,
    ],
    exports: [FilesService, FileLifecycleService, FILE_STORAGE_PORT],
})
export class FilesModule {}
