import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredFileEntity } from './entities/stored-file.entity';
import { FILE_STORAGE_PORT } from './file-storage.types';
import { FilesService } from './files.service';
import { LocalFileStorageProvider } from './local-file-storage.provider';

@Module({
    imports: [TypeOrmModule.forFeature([StoredFileEntity])],
    providers: [
        LocalFileStorageProvider,
        { provide: FILE_STORAGE_PORT, useExisting: LocalFileStorageProvider },
        FilesService,
    ],
    exports: [FilesService, FILE_STORAGE_PORT],
})
export class FilesModule {}
