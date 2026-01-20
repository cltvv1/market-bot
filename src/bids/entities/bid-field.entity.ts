import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bid_fields')
export class BidFieldEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column()
    label: string;

    @Column({ type: 'int', default: 1 })
    step: number;
}