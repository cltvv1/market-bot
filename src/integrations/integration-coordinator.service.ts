import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegrationProvider } from './integration.types';

@Injectable()
export class IntegrationCoordinatorService {
    constructor(private readonly config: ConfigService) {}

    async health() {
        const entries = await Promise.all(
            (['atol_connect', 'platforma_ofd'] as const).map(
                async (provider) => {
                    try {
                        return [
                            provider,
                            await this.call(provider, '/health', 'GET', 5000),
                        ] as const;
                    } catch (error) {
                        return [
                            provider,
                            { ready: false, error: this.safeError(error) },
                        ] as const;
                    }
                },
            ),
        );
        return Object.fromEntries(entries);
    }

    sync(provider: IntegrationProvider) {
        return this.call(provider, '/sync', 'POST', 15 * 60 * 1000);
    }

    private async call(
        provider: IntegrationProvider,
        path: string,
        method: 'GET' | 'POST',
        timeout: number,
    ) {
        const bridgeKey = this.config
            .get<string>('INTEGRATION_BRIDGE_KEY')
            ?.trim();
        if (!bridgeKey)
            throw new BadGatewayException(
                'Integration bridge is not configured',
            );
        const baseUrl =
            provider === 'atol_connect'
                ? this.config.get<string>('ATOL_BRIDGE_URL') ||
                  'http://127.0.0.1:4318'
                : this.config.get<string>('POFD_BRIDGE_URL') ||
                  'http://127.0.0.1:4319';
        const url = new URL(path, baseUrl);
        if (!['http:', 'https:'].includes(url.protocol))
            throw new BadGatewayException('Integration bridge URL is invalid');
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'x-vitma-bridge-key': bridgeKey,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(timeout),
            });
            const payload = (await response.json()) as Record<string, unknown>;
            if (!response.ok)
                throw new Error(
                    typeof payload.error === 'string'
                        ? payload.error
                        : `HTTP ${response.status}`,
                );
            return payload;
        } catch (error) {
            throw new BadGatewayException(this.safeError(error));
        }
    }

    private safeError(error: unknown) {
        return (
            error instanceof Error
                ? error.message
                : 'Integration bridge is unavailable'
        )
            .replace(/https?:\/\/\S+/gi, '[url removed]')
            .slice(0, 500);
    }
}
