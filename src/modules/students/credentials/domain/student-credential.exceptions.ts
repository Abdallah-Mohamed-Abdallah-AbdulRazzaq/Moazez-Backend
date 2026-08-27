import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import {
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE,
} from './student-credential.constants';

export class StudentCredentialAudienceInvalidException extends DomainException {
  constructor(reasonCode: string) {
    super({
      code: 'students.credentials.audience_invalid',
      message: 'Student credential audience is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reasonCode },
    });
  }
}

export class StudentCredentialNoEligibleStudentsException extends DomainException {
  constructor() {
    super({
      code: 'students.credentials.no_eligible_students',
      message: 'No eligible students matched the credential audience',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class StudentCredentialExecutionInvariantException extends DomainException {
  constructor(reasonCode: string) {
    super({
      code: 'students.credentials.execution_invariant_invalid',
      message: 'Student credential execution state is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode },
    });
  }
}

export class StudentCredentialExecutionTenantIneligibleException extends DomainException {
  constructor() {
    super({
      code: 'students.credentials.execution_tenant_ineligible',
      message: 'Student credential execution tenant is not eligible',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}

export type StudentCredentialSecretArtifactTerminalCode =
  | typeof STUDENT_CREDENTIAL_SECRET_ARTIFACT_UNAVAILABLE_CODE
  | typeof STUDENT_CREDENTIAL_SECRET_ARTIFACT_EXPIRED_CODE
  | typeof STUDENT_CREDENTIAL_SECRET_ARTIFACT_INVALID_CODE;

export class StudentCredentialSecretArtifactException extends DomainException {
  constructor(code: StudentCredentialSecretArtifactTerminalCode) {
    super({
      code,
      message: 'Student credential secret artifact is unavailable or invalid',
      httpStatus: HttpStatus.CONFLICT,
    });
  }
}
