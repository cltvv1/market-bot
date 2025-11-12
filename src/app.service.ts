import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { regEntity } from './reg.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AppService {

  constructor(@InjectRepository(regEntity) private readonly regRepository: Repository<regEntity>) {

  }

  async getAll() {
    return this.regRepository.find()
  }

  async getById(id: number) {
    return this.regRepository.findOneBy({ id })
  }

  async createReg(name: string) {
    const reg = await this.regRepository.create({ name })

    await this.regRepository.save(reg)
    return this.getAll()
  }

  async doneReg(id: number) {
    const reg = await this.getById(id)
    if (!reg) return null

    reg.isFilled = !reg.isFilled
    return this.regRepository.save(reg)
  }

  async editReg(id: number, name: string) {
    const reg = await this.getById(id)
    if (!reg) return null

    reg.name = name
    return this.regRepository.save(reg)
  }

  async deleteReg(id: number) {
    const reg = await this.getById(id)
    if (!reg) return null

    return this.regRepository.delete({ id })
  }
}
