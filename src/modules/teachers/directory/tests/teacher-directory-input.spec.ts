import { ValidationPipe } from '@nestjs/common';
import { TeacherWorkDay } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  normalizeNullableText,
  normalizeTeacherWorkingDays,
  parseTeacherDateOnly,
  parseTeacherTime,
} from '../domain/teacher-directory-input';
import {
  CreateTeacherDto,
  ListTeachersQueryDto,
  RehireTeacherDto,
  UpdateTeacherEmploymentStatusDto,
  UpdateTeacherDto,
} from '../dto/teacher-directory.dto';

describe('Teacher Directory input integrity', () => {
  it('normalizes nullable bounded text without inventing a value', () => {
    expect(normalizeNullableText('  Science  ')).toBe('Science');
    expect(normalizeNullableText('   ')).toBeNull();
    expect(normalizeNullableText(null)).toBeNull();
  });

  it.each([
    ['2026-02-28', '2026-02-28T00:00:00.000Z'],
    ['2028-02-29', '2028-02-29T00:00:00.000Z'],
  ])('accepts real date-only input %s', (input, expected) => {
    expect(parseTeacherDateOnly(input, 'hireDate')?.toISOString()).toBe(
      expected,
    );
  });

  it.each(['2025-02-29', '2026-02-31', '2026-04-31', '2026-13-01'])(
    'rejects calendar-invalid date-only input %s',
    (input) => {
      expect(() => parseTeacherDateOnly(input, 'hireDate')).toThrow(
        'Invalid Teacher Directory field',
      );
    },
  );

  it.each([
    ['08:15', '1970-01-01T08:15:00.000Z'],
    ['17:45:59', '1970-01-01T17:45:59.000Z'],
  ])('accepts valid work time %s', (input, expected) => {
    expect(parseTeacherTime(input, 'workStartTime')?.toISOString()).toBe(
      expected,
    );
  });

  it.each(['24:00', '12:60', '12:00:60', '9:00'])(
    'rejects invalid work time %s',
    (input) => {
      expect(() => parseTeacherTime(input, 'workStartTime')).toThrow(
        'Invalid Teacher Directory field',
      );
    },
  );

  it('deduplicates no input and produces canonical weekday ordering', () => {
    expect(
      normalizeTeacherWorkingDays([
        TeacherWorkDay.FRIDAY,
        TeacherWorkDay.SUNDAY,
        TeacherWorkDay.TUESDAY,
      ]),
    ).toEqual([
      TeacherWorkDay.SUNDAY,
      TeacherWorkDay.TUESDAY,
      TeacherWorkDay.FRIDAY,
    ]);
  });

  it('rejects duplicate working days before persistence', () => {
    expect(() =>
      normalizeTeacherWorkingDays([
        TeacherWorkDay.MONDAY,
        TeacherWorkDay.MONDAY,
      ]),
    ).toThrow('Working days must be unique');
  });

  it.each([
    [{ gender: 'OTHER' }, 'gender'],
    [{ employmentType: 'OTHER' }, 'employmentType'],
    [{ experienceYears: -1 }, 'experienceYears'],
    [{ experienceYears: 61 }, 'experienceYears'],
    [{ notesAr: 'x'.repeat(501) }, 'notesAr'],
    [{ workingDays: Array(8).fill(TeacherWorkDay.MONDAY) }, 'workingDays'],
  ])('DTO rejects invalid managed field %s', async (value, field) => {
    const errors = await validate(plainToInstance(UpdateTeacherDto, value));
    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('global strict validation rejects lifecycle, credential, and feature fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const field of [
      'password',
      'passwordHash',
      'mustChangePassword',
      'accountStatus',
      'membershipStatus',
      'employmentStatus',
      'roleId',
      'schoolId',
      'organizationId',
      'assignments',
      'avatar',
    ]) {
      await expect(
        pipe.transform(
          { [field]: 'forbidden' },
          {
            type: 'body',
            metatype: UpdateTeacherDto,
          },
        ),
      ).rejects.toThrow();
    }
  });

  it('requires a complete Profile, preferred language, and explicit supported employment state for POST', async () => {
    const valid = {
      loginEmail: 'teacher@example.test',
      teacherCode: 'T001',
      firstNameAr: 'نور',
      lastNameAr: 'علي',
      firstNameEn: 'Nour',
      lastNameEn: 'Ali',
      preferredDisplayLanguage: 'EN',
      gender: 'FEMALE',
      employmentStatus: 'ACTIVE',
    };
    expect(await validate(plainToInstance(CreateTeacherDto, valid))).toEqual(
      [],
    );
    for (const field of [
      'teacherCode',
      'firstNameAr',
      'lastNameAr',
      'firstNameEn',
      'lastNameEn',
      'preferredDisplayLanguage',
      'gender',
      'employmentStatus',
    ]) {
      const missing = { ...valid } as Record<string, unknown>;
      delete missing[field];
      expect(
        (await validate(plainToInstance(CreateTeacherDto, missing))).some(
          (error) => error.property === field,
        ),
      ).toBe(true);
    }
    expect(
      (
        await validate(
          plainToInstance(CreateTeacherDto, {
            ...valid,
            employmentStatus: 'TERMINATED',
          }),
        )
      ).some((error) => error.property === 'employmentStatus'),
    ).toBe(true);
  });

  it('strict POST DTO rejects password, status, role, tenant, assignment, and avatar ownership bypasses', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const valid = {
      loginEmail: 'teacher@example.test',
      teacherCode: 'T001',
      firstNameAr: 'نور',
      lastNameAr: 'علي',
      firstNameEn: 'Nour',
      lastNameEn: 'Ali',
      preferredDisplayLanguage: 'EN',
      gender: 'FEMALE',
      employmentStatus: 'ACTIVE',
    };
    for (const field of [
      'password',
      'passwordHash',
      'temporaryPassword',
      'mustChangePassword',
      'credentialVersion',
      'passwordProvisionedAt',
      'passwordChangedAt',
      'accountStatus',
      'membershipStatus',
      'roleId',
      'userType',
      'schoolId',
      'organizationId',
      'deletedAt',
      'assignments',
      'subjects',
      'classes',
      'avatar',
    ]) {
      await expect(
        pipe.transform(
          { ...valid, [field]: 'forbidden' },
          { type: 'body', metatype: CreateTeacherDto },
        ),
      ).rejects.toThrow();
    }
  });

  it('accepts only the three employment states and a syntactically exact ISO effectiveAt', async () => {
    for (const employmentStatus of ['ACTIVE', 'INACTIVE', 'TERMINATED']) {
      expect(
        await validate(
          plainToInstance(UpdateTeacherEmploymentStatusDto, {
            employmentStatus,
            effectiveAt: '2026-07-18T16:36:19.198Z',
          }),
        ),
      ).toEqual([]);
    }
    expect(
      (
        await validate(
          plainToInstance(UpdateTeacherEmploymentStatusDto, {
            employmentStatus: 'UNKNOWN',
          }),
        )
      ).some((error) => error.property === 'employmentStatus'),
    ).toBe(true);
  });

  it('strict employment DTO rejects ownership, credential, assignment, and avatar fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const field of [
      'accountStatus',
      'membershipStatus',
      'roleId',
      'userType',
      'schoolId',
      'organizationId',
      'password',
      'mustChangePassword',
      'assignments',
      'avatar',
      'deletedAt',
      'reason',
    ]) {
      await expect(
        pipe.transform(
          { employmentStatus: 'INACTIVE', [field]: 'forbidden' },
          {
            type: 'body',
            metatype: UpdateTeacherEmploymentStatusDto,
          },
        ),
      ).rejects.toThrow();
    }
  });

  it('requires complete managed input for rehire and rejects lifecycle, IAM, credential, and tenant ownership', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const valid = {
      teacherCode: 'T001',
      firstNameAr: 'نور',
      lastNameAr: 'علي',
      firstNameEn: 'Nour',
      lastNameEn: 'Ali',
      preferredDisplayLanguage: 'AR',
      gender: 'FEMALE',
    };
    expect(await validate(plainToInstance(RehireTeacherDto, valid))).toEqual(
      [],
    );
    for (const field of [
      'teacherCode',
      'firstNameAr',
      'lastNameAr',
      'firstNameEn',
      'lastNameEn',
      'preferredDisplayLanguage',
      'gender',
    ]) {
      const missing = { ...valid } as Record<string, unknown>;
      delete missing[field];
      expect(
        (await validate(plainToInstance(RehireTeacherDto, missing))).some(
          (error) => error.property === field,
        ),
      ).toBe(true);
    }
    for (const field of [
      'employmentStatus',
      'accountStatus',
      'membershipStatus',
      'loginEmail',
      'username',
      'contactEmail',
      'phone',
      'password',
      'credentialVersion',
      'roleId',
      'userType',
      'schoolId',
      'organizationId',
      'assignments',
      'avatar',
      'deletedAt',
    ]) {
      await expect(
        pipe.transform(
          { ...valid, [field]: 'forbidden' },
          { type: 'body', metatype: RehireTeacherDto },
        ),
      ).rejects.toThrow();
    }
  });

  it('bounds and transforms the repository-standard page/limit query', async () => {
    const instance = plainToInstance(ListTeachersQueryDto, {
      page: '2',
      limit: '100',
      profileCompleteness: 'incomplete',
    });
    expect(await validate(instance)).toEqual([]);
    expect(instance).toMatchObject({ page: 2, limit: 100 });
    expect(
      await validate(plainToInstance(ListTeachersQueryDto, { limit: 101 })),
    ).not.toEqual([]);
  });
});
