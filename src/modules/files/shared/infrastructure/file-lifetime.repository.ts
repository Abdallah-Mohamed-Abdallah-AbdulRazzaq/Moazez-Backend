import type { Prisma } from '@prisma/client';

/** Internal integrity check: File identity is global, including corrupt tenant links. */
export async function hasRetainedFileReferences(
  tx: Prisma.TransactionClient,
  fileId: string,
): Promise<boolean> {
  // Upload sessions describe provenance, not consumer retention. External FKs
  // retain their File even when an unrelated domain soft-deletes its owner.
  const [result] = await tx.$queryRaw<Array<{ retained: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM public.settings_school_profile WHERE logo_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.admission_application_documents WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.applicant_admission_request_documents WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.academic_content_assets WHERE file_id = ${fileId}::uuid AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM public.academic_content_revision_assets WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.lesson_content_items WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.teacher_profiles WHERE avatar_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.students WHERE avatar_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.student_credential_batches WHERE secret_artifact_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.student_documents WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.homework_submission_attachments WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.homework_assignment_attachments WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.reinforcement_submissions WHERE proof_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.reward_catalog_items WHERE image_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.hero_badges WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.communication_conversations WHERE avatar_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.communication_message_attachments WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.communication_announcements WHERE image_file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.communication_announcement_attachments WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.attachments WHERE file_id = ${fileId}::uuid
      UNION ALL
      SELECT 1 FROM public.import_jobs WHERE uploaded_file_id = ${fileId}::uuid
    ) AS retained`;
  return result.retained;
}
