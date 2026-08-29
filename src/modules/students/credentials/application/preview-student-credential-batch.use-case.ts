import { Injectable } from '@nestjs/common';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { parseStudentCredentialAudience } from '../domain/student-credential-audience';
import type { StudentCredentialAudienceCommand } from '../domain/student-credential.types';
import type { StudentCredentialBatchPreviewResponseDto } from '../dto/student-credential-batch.dto';
import { presentStudentCredentialPreview } from '../presenters/student-credential-batch.presenter';
import { StudentCredentialAudienceService } from './student-credential-audience.service';

@Injectable()
export class PreviewStudentCredentialBatchUseCase {
  constructor(private readonly audience: StudentCredentialAudienceService) {}

  async execute(
    command: StudentCredentialAudienceCommand,
  ): Promise<StudentCredentialBatchPreviewResponseDto> {
    const scope = requireStudentsScope();
    const selection = parseStudentCredentialAudience(command);
    return presentStudentCredentialPreview(
      await this.audience.resolve(scope, selection),
    );
  }
}
