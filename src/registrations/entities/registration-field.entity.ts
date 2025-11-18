import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('registration_fields')
export class RegistrationFieldEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column()
    label: string;

    @Column({ type: 'int', default: 1 })
    step: number;
}
