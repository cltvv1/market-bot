import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'Reg' })
export class regEntity {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ type: 'text' })
    name: string

    @Column({ default: false })
    isFilled: boolean
}