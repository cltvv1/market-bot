import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { UiServingService } from './ui-serving.service';

describe('UiServingService', () => {
    let temporaryRoot: string;

    beforeEach(() => {
        temporaryRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'vitma-ui-serving-'),
        );
    });

    afterEach(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    function createService(
        values: Record<string, string | boolean>,
        includeAdmin = true,
        includeSite = true,
    ) {
        const adminRoot = path.join(temporaryRoot, 'admin');
        const siteRoot = path.join(temporaryRoot, 'site');
        if (includeAdmin) {
            writeBuild(adminRoot, ['index.html', 'admin.js', 'admin.css']);
        }
        if (includeSite) {
            writeBuild(siteRoot, ['index.html', 'site.js', 'site.css']);
        }
        return new UiServingService(
            new ConfigService({
                ADMIN_UI_DIST: adminRoot,
                CLIENT_UI_DIST: siteRoot,
                ...values,
            }),
        );
    }

    it('serves both React entries in explicit production mode', () => {
        const service = createService({
            NODE_ENV: 'production',
            SERVE_BUILT_UI: true,
            ENABLE_LEGACY_UI: false,
        });

        service.onModuleInit();

        expect(service.getMode()).toBe('built');
        expect(service.getEntryHtml('admin', 'legacy')).toContain('index.html');
        expect(service.getEntryHtml('site', 'legacy')).toContain('index.html');
    });

    it('fails production startup when the client build is missing', () => {
        const service = createService(
            {
                NODE_ENV: 'production',
                SERVE_BUILT_UI: true,
                ENABLE_LEGACY_UI: false,
            },
            true,
            false,
        );

        expect(() => service.onModuleInit()).toThrow(
            /Required site React build file is missing/,
        );
    });

    it('fails production startup when the admin build is missing', () => {
        const service = createService(
            {
                NODE_ENV: 'production',
                SERVE_BUILT_UI: true,
                ENABLE_LEGACY_UI: false,
            },
            false,
            true,
        );

        expect(() => service.onModuleInit()).toThrow(
            /Required admin React build file is missing/,
        );
    });

    it('allows a development backend without production builds', () => {
        const service = createService(
            {
                NODE_ENV: 'development',
                SERVE_BUILT_UI: false,
                ENABLE_LEGACY_UI: false,
            },
            false,
            false,
        );

        service.onModuleInit();

        expect(service.getMode()).toBe('disabled');
        expect(() => service.getEntryHtml('site', 'legacy')).toThrow(
            /Built UI serving is disabled/,
        );
    });

    it('allows legacy HTML only when explicitly enabled in development', () => {
        const service = createService(
            {
                NODE_ENV: 'development',
                SERVE_BUILT_UI: false,
                ENABLE_LEGACY_UI: true,
            },
            false,
            false,
        );

        service.onModuleInit();

        expect(service.getMode()).toBe('legacy');
        expect(service.getEntryHtml('admin', 'legacy-admin')).toBe(
            'legacy-admin',
        );
    });

    it('rejects legacy HTML in production', () => {
        const service = createService({
            NODE_ENV: 'production',
            SERVE_BUILT_UI: false,
            ENABLE_LEGACY_UI: true,
        });

        expect(() => service.onModuleInit()).toThrow(
            /ENABLE_LEGACY_UI is forbidden in production/,
        );
    });
});

function writeBuild(root: string, files: string[]) {
    fs.mkdirSync(root, { recursive: true });
    for (const fileName of files) {
        fs.writeFileSync(path.join(root, fileName), `<html>${fileName}</html>`);
    }
}
