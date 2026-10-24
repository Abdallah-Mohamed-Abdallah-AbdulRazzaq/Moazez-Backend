-- Enum additions commit before purpose-specific CHECK expressions.
ALTER TYPE "file_upload_purpose" ADD VALUE 'HOMEWORK_ASSIGNMENT_MEDIA';
ALTER TYPE "file_upload_purpose" ADD VALUE 'GRADE_ASSESSMENT_MEDIA';
ALTER TYPE "file_upload_purpose" ADD VALUE 'HOMEWORK_SUBMISSION_MEDIA';
ALTER TYPE "file_upload_purpose" ADD VALUE 'GRADE_SUBMISSION_MEDIA';
