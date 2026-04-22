import { Module } from '@nestjs/common';
import { CreateGuardianUseCase } from './application/create-guardian.use-case';
import { GetGuardianStudentsUseCase } from './application/get-guardian-students.use-case';
import { GetGuardianUseCase } from './application/get-guardian.use-case';
import { GetPrimaryStudentGuardiansUseCase } from './application/get-primary-student-guardians.use-case';
import { LinkGuardianToStudentUseCase } from './application/link-guardian-to-student.use-case';
import { ListGuardiansUseCase } from './application/list-guardians.use-case';
import { ListStudentGuardiansUseCase } from './application/list-student-guardians.use-case';
import { UnlinkGuardianFromStudentUseCase } from './application/unlink-guardian-from-student.use-case';
import { UpdateGuardianUseCase } from './application/update-guardian.use-case';
import { UpdateStudentGuardianLinkUseCase } from './application/update-student-guardian-link.use-case';
import { GuardiansController } from './controller/guardians.controller';
import { StudentGuardiansController } from './controller/student-guardians.controller';
import { GuardiansRepository } from './infrastructure/guardians.repository';

@Module({
  controllers: [GuardiansController, StudentGuardiansController],
  providers: [
    GuardiansRepository,
    ListGuardiansUseCase,
    CreateGuardianUseCase,
    GetGuardianUseCase,
    UpdateGuardianUseCase,
    GetGuardianStudentsUseCase,
    ListStudentGuardiansUseCase,
    GetPrimaryStudentGuardiansUseCase,
    LinkGuardianToStudentUseCase,
    UpdateStudentGuardianLinkUseCase,
    UnlinkGuardianFromStudentUseCase,
  ],
  exports: [GuardiansRepository],
})
export class GuardiansModule {}
