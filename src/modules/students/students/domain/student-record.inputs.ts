import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  ResolvedPersonName,
  normalizeOptionalText,
  parseOptionalPersonNameParts,
  resolvePersonName,
} from './person-name.helper';

type StudentNameFields = {
  name?: string | null;
  full_name_en?: string | null;
  full_name_ar?: string | null;
  first_name_en?: string | null;
  father_name_en?: string | null;
  grandfather_name_en?: string | null;
  first_name_ar?: string | null;
  father_name_ar?: string | null;
  grandfather_name_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
};

type StudentProfileFields = StudentNameFields & {
  gender?: string | null;
  nationality?: string | null;
  contact?: {
    address_line?: string | null;
    city?: string | null;
    district?: string | null;
    student_phone?: string | null;
    student_email?: string | null;
  } | null;
};

export interface ResolvedStudentProfileFields {
  fatherNameEn: string | null;
  grandfatherNameEn: string | null;
  firstNameAr: string | null;
  fatherNameAr: string | null;
  grandfatherNameAr: string | null;
  familyNameAr: string | null;
  gender: string | null;
  nationality: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
  studentPhone: string | null;
  studentEmail: string | null;
}

type StudentProfilePatch = Partial<ResolvedStudentProfileFields>;

export function resolveStudentName(
  fields: StudentNameFields,
  fallback?: { firstName: string; lastName: string },
): ResolvedPersonName {
  const englishName =
    normalizeOptionalText(fields.full_name_en) ??
    normalizeOptionalText(fields.name);
  const arabicName = normalizeOptionalText(fields.full_name_ar);
  const parsedEnglishName = parseOptionalPersonNameParts(englishName);
  const parsedArabicName = parseOptionalPersonNameParts(arabicName);

  return resolvePersonName({
    firstName:
      normalizeOptionalText(fields.first_name_en) ??
      parsedEnglishName?.firstName ??
      normalizeOptionalText(fields.first_name_ar) ??
      parsedArabicName?.firstName,
    lastName:
      normalizeOptionalText(fields.family_name_en) ??
      parsedEnglishName?.familyName ??
      normalizeOptionalText(fields.family_name_ar) ??
      parsedArabicName?.familyName,
    fullName: englishName ?? arabicName,
    fallbackFirstName: fallback?.firstName,
    fallbackLastName: fallback?.lastName,
    label: 'student',
  });
}

export function resolveStudentProfileFields(
  fields: StudentProfileFields,
): ResolvedStudentProfileFields {
  const englishName =
    normalizeOptionalText(fields.full_name_en) ??
    normalizeOptionalText(fields.name);
  const parsedEnglishName = parseOptionalPersonNameParts(
    englishName,
  );
  const parsedArabicName = parseOptionalPersonNameParts(fields.full_name_ar);

  return {
    fatherNameEn:
      normalizeOptionalText(fields.father_name_en) ??
      parsedEnglishName?.fatherName ??
      null,
    grandfatherNameEn:
      normalizeOptionalText(fields.grandfather_name_en) ??
      parsedEnglishName?.grandfatherName ??
      null,
    firstNameAr:
      normalizeOptionalText(fields.first_name_ar) ??
      parsedArabicName?.firstName ??
      null,
    fatherNameAr:
      normalizeOptionalText(fields.father_name_ar) ??
      parsedArabicName?.fatherName ??
      null,
    grandfatherNameAr:
      normalizeOptionalText(fields.grandfather_name_ar) ??
      parsedArabicName?.grandfatherName ??
      null,
    familyNameAr:
      normalizeOptionalText(fields.family_name_ar) ??
      parsedArabicName?.familyName ??
      null,
    gender: normalizeOptionalText(fields.gender),
    nationality: normalizeOptionalText(fields.nationality),
    addressLine: normalizeOptionalText(fields.contact?.address_line),
    city: normalizeOptionalText(fields.contact?.city),
    district: normalizeOptionalText(fields.contact?.district),
    studentPhone: normalizeOptionalText(fields.contact?.student_phone),
    studentEmail: normalizeOptionalText(fields.contact?.student_email),
  };
}

export function resolveStudentProfilePatch(
  fields: StudentProfileFields,
): StudentProfilePatch {
  const patch: StudentProfilePatch = {};
  const englishName =
    normalizeOptionalText(fields.full_name_en) ??
    normalizeOptionalText(fields.name);
  const parsedEnglishName =
    fields.full_name_en !== undefined || fields.name !== undefined
      ? parseOptionalPersonNameParts(englishName)
      : null;
  const parsedArabicName =
    fields.full_name_ar !== undefined
      ? parseOptionalPersonNameParts(fields.full_name_ar)
      : null;

  if (fields.full_name_en !== undefined || fields.name !== undefined) {
    patch.fatherNameEn = parsedEnglishName?.fatherName ?? null;
    patch.grandfatherNameEn = parsedEnglishName?.grandfatherName ?? null;
  }

  if (fields.father_name_en !== undefined) {
    patch.fatherNameEn = normalizeOptionalText(fields.father_name_en);
  }

  if (fields.grandfather_name_en !== undefined) {
    patch.grandfatherNameEn = normalizeOptionalText(
      fields.grandfather_name_en,
    );
  }

  if (fields.full_name_ar !== undefined) {
    patch.firstNameAr = parsedArabicName?.firstName ?? null;
    patch.fatherNameAr = parsedArabicName?.fatherName ?? null;
    patch.grandfatherNameAr = parsedArabicName?.grandfatherName ?? null;
    patch.familyNameAr = parsedArabicName?.familyName ?? null;
  }

  if (fields.first_name_ar !== undefined) {
    patch.firstNameAr = normalizeOptionalText(fields.first_name_ar);
  }

  if (fields.father_name_ar !== undefined) {
    patch.fatherNameAr = normalizeOptionalText(fields.father_name_ar);
  }

  if (fields.grandfather_name_ar !== undefined) {
    patch.grandfatherNameAr = normalizeOptionalText(
      fields.grandfather_name_ar,
    );
  }

  if (fields.family_name_ar !== undefined) {
    patch.familyNameAr = normalizeOptionalText(fields.family_name_ar);
  }

  if (fields.gender !== undefined) {
    patch.gender = normalizeOptionalText(fields.gender);
  }

  if (fields.nationality !== undefined) {
    patch.nationality = normalizeOptionalText(fields.nationality);
  }

  if (fields.contact !== undefined) {
    if (fields.contact === null) {
      patch.addressLine = null;
      patch.city = null;
      patch.district = null;
      patch.studentPhone = null;
      patch.studentEmail = null;
      return patch;
    }

    if (fields.contact.address_line !== undefined) {
      patch.addressLine = normalizeOptionalText(fields.contact.address_line);
    }
    if (fields.contact.city !== undefined) {
      patch.city = normalizeOptionalText(fields.contact.city);
    }
    if (fields.contact.district !== undefined) {
      patch.district = normalizeOptionalText(fields.contact.district);
    }
    if (fields.contact.student_phone !== undefined) {
      patch.studentPhone = normalizeOptionalText(fields.contact.student_phone);
    }
    if (fields.contact.student_email !== undefined) {
      patch.studentEmail = normalizeOptionalText(fields.contact.student_email);
    }
  }

  return patch;
}

export function resolveStudentBirthDate(
  dateOfBirth?: string | null,
  legacyDateOfBirth?: string | null,
  fallback?: Date | null,
): Date | null {
  const normalizedDateOfBirth = normalizeOptionalText(dateOfBirth);
  const normalizedLegacyDateOfBirth = normalizeOptionalText(legacyDateOfBirth);

  if (
    normalizedDateOfBirth &&
    normalizedLegacyDateOfBirth &&
    normalizedDateOfBirth !== normalizedLegacyDateOfBirth
  ) {
    throw new ValidationDomainException('Student birth date fields must match', {
      fields: ['dateOfBirth', 'date_of_birth'],
    });
  }

  const nextValue = normalizedDateOfBirth ?? normalizedLegacyDateOfBirth;
  if (!nextValue) {
    return fallback ?? null;
  }

  const parsed = new Date(`${nextValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationDomainException('Student birth date is invalid', {
      field: 'dateOfBirth',
    });
  }

  return parsed;
}
