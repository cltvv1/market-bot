import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BidFieldEntity } from 'src/bids/entities/bid-field.entity';
import { RegistrationFieldEntity } from 'src/registrations/entities/registration-field.entity';
import { BID_FIELD_SEEDS, FieldSeed, REGISTRATION_FIELD_SEEDS } from './seed-data';

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(DatabaseSeedService.name);

    constructor(
        @InjectRepository(BidFieldEntity)
        private readonly bidFieldsRepo: Repository<BidFieldEntity>,

        @InjectRepository(RegistrationFieldEntity)
        private readonly registrationFieldsRepo: Repository<RegistrationFieldEntity>,
    ) { }

    async onApplicationBootstrap() {
        const registrationCount = await this.upsertFields(
            this.registrationFieldsRepo,
            REGISTRATION_FIELD_SEEDS,
        );
        const bidCount = await this.upsertFields(this.bidFieldsRepo, BID_FIELD_SEEDS);

        if (registrationCount || bidCount) {
            this.logger.log(
                `Seeded field dictionaries: registration=${registrationCount}, bid=${bidCount}`,
            );
        }
    }

    private async upsertFields<TEntity extends { name: string; label: string; step: number }>(
        repo: Repository<TEntity>,
        seeds: FieldSeed<string>[],
    ) {
        let changed = 0;

        for (const seed of seeds) {
            const existing = await repo.findOne({ where: { name: seed.name } as any });

            if (!existing) {
                await repo.save(repo.create(seed as any));
                changed++;
                continue;
            }

            if (existing.label !== seed.label || existing.step !== seed.step) {
                await repo.update({ name: seed.name } as any, {
                    label: seed.label,
                    step: seed.step,
                } as any);
                changed++;
            }
        }

        return changed;
    }
}
