import { Module } from '@nestjs/common';
import { CreateLeadUseCase } from './application/create-lead.use-case';
import { GetLeadUseCase } from './application/get-lead.use-case';
import { ListLeadsUseCase } from './application/list-leads.use-case';
import { UpdateLeadUseCase } from './application/update-lead.use-case';
import { LeadsController } from './controller/leads.controller';
import { LeadsRepository } from './infrastructure/leads.repository';

@Module({
  controllers: [LeadsController],
  providers: [
    LeadsRepository,
    ListLeadsUseCase,
    CreateLeadUseCase,
    GetLeadUseCase,
    UpdateLeadUseCase,
  ],
  exports: [LeadsRepository],
})
export class LeadsModule {}
