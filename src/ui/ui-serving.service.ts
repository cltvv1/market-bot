import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    Injectable,
    NotFoundException,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UiApplication = 'admin' | 'site';
export type UiServingMode = 'built' | 'disabled';

@Injectable()
export class UiServingService implements OnModuleInit {
    private mode?: UiServingMode;

    constructor(private readonly config: ConfigService) {}

    onModuleInit() {
        this.mode = this.resolveMode();
    }

    getMode(): UiServingMode {
        this.mode ??= this.resolveMode();
        return this.mode;
    }

    getEntryHtml(application: UiApplication) {
        const mode = this.getMode();
        if (mode === 'disabled') {
            throw new ServiceUnavailableException(
                'Built UI serving is disabled. Run the Vite development server or set SERVE_BUILT_UI=true after building the UI.',
            );
        }
        return fs.readFileSync(
            this.getRequiredFile(application, 'index.html'),
            'utf8',
        );
    }

    getAssetPath(application: UiApplication, fileName: string) {
        if (this.getMode() !== 'built') {
            throw new NotFoundException(
                'Built UI assets are not served in the current UI mode',
            );
        }
        return this.getRequiredFile(application, fileName);
    }

    private resolveMode(): UiServingMode {
        const environment =
            this.config.get<string>('NODE_ENV') ?? 'development';
        const serveBuilt = this.config.get<boolean>('SERVE_BUILT_UI') ?? false;
        if (environment === 'production' && !serveBuilt) {
            throw new Error('Production requires SERVE_BUILT_UI=true');
        }
        if (serveBuilt) {
            this.validateBuiltApplication('admin', [
                'index.html',
                'admin.js',
                'admin.css',
            ]);
            this.validateBuiltApplication('site', [
                'index.html',
                'site.js',
                'site.css',
            ]);
            return 'built';
        }
        return 'disabled';
    }

    private validateBuiltApplication(
        application: UiApplication,
        requiredFiles: string[],
    ) {
        for (const fileName of requiredFiles) {
            this.getRequiredFile(application, fileName);
        }
    }

    private getRequiredFile(application: UiApplication, fileName: string) {
        const root = this.getDistributionRoot(application);
        const filePath = path.join(root, fileName);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error(
                `Required ${application} React build file is missing: ${filePath}`,
            );
        }
        return filePath;
    }

    private getDistributionRoot(application: UiApplication) {
        const configKey =
            application === 'admin' ? 'ADMIN_UI_DIST' : 'CLIENT_UI_DIST';
        const configured = this.config.get<string>(configKey);
        const fallback =
            application === 'admin' ? 'admin-ui/dist' : 'client-ui/dist';
        return path.resolve(process.cwd(), configured || fallback);
    }
}
