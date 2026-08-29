import { buildSchoolFileObjectKey } from '../../../files/uploads/domain/uploaded-file';
import {
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME,
  STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION,
} from './student-credential.constants';

export function studentCredentialSecretArtifactObjectKey(input: {
  schoolId: string;
  batchId: string;
  version?: number;
}): string {
  const version = input.version ?? STUDENT_CREDENTIAL_SECRET_ARTIFACT_VERSION;
  return buildSchoolFileObjectKey(
    input.schoolId,
    STUDENT_CREDENTIAL_SECRET_ARTIFACT_ORIGINAL_NAME,
    `student-credential-batch-${input.batchId}-v${version}`,
  );
}
