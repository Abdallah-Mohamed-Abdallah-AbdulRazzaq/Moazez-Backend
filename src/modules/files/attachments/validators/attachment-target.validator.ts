import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export const ATTACHMENT_PREVIEW_RESOURCE_TYPES = [
  'admissions.application',
  'attendance.excuse_request',
] as const;

type AttachmentPreviewResourceType =
  (typeof ATTACHMENT_PREVIEW_RESOURCE_TYPES)[number];

export function validateAttachmentTarget(
  resourceType: string,
  resourceId: string,
): {
  resourceType: AttachmentPreviewResourceType;
  resourceId: string;
} {
  const normalizedResourceType = resourceType.trim();
  const normalizedResourceId = resourceId.trim();

  if (normalizedResourceType.length === 0) {
    throw new ValidationDomainException('Attachment resourceType is required', {
      field: 'resourceType',
    });
  }

  if (normalizedResourceId.length === 0) {
    throw new ValidationDomainException('Attachment resourceId is required', {
      field: 'resourceId',
    });
  }

  if (
    !ATTACHMENT_PREVIEW_RESOURCE_TYPES.includes(
      normalizedResourceType as AttachmentPreviewResourceType,
    )
  ) {
    throw new ValidationDomainException(
      'Attachments preview is limited to supported resource types',
      {
        field: 'resourceType',
        resourceType: normalizedResourceType,
        allowedValues: [...ATTACHMENT_PREVIEW_RESOURCE_TYPES],
      },
    );
  }

  return {
    resourceType: normalizedResourceType as AttachmentPreviewResourceType,
    resourceId: normalizedResourceId,
  };
}
