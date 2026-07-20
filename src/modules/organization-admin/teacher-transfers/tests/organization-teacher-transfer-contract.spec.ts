import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { TeacherGender, TeacherWorkDay } from '@prisma/client';
import { validateSync } from 'class-validator';
import { ORGANIZATION_MANAGEMENT_ONLY_METADATA } from '../../../../common/decorators/organization-management-only.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { OrganizationTeacherTransfersController } from '../controller/organization-teacher-transfers.controller';
import { TransferTeacherToSchoolDto } from '../dto/transfer-teacher-to-school.dto';
import {
  TeacherTransferConflictException,
  TeacherTransferNotFoundException,
  TEACHER_TRANSFER_REASON_CODES,
} from '../domain/organization-teacher-transfer.errors';

const root = join(__dirname, '..', '..', '..', '..');

function validInput(): Record<string, unknown> {
  return {
    destinationSchoolId: '11111111-1111-4111-8111-111111111111',
    teacherCode: 'T001',
    firstNameAr: 'أحمد',
    lastNameAr: 'علي',
    firstNameEn: 'Ahmed',
    lastNameEn: 'Ali',
    preferredDisplayLanguage: 'AR',
    gender: TeacherGender.MALE,
  };
}

function errors(input: Record<string, unknown>) {
  return validateSync(plainToInstance(TransferTeacherToSchoolDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('Organization Teacher transfer HTTP and DTO contract', () => {
  it('locks the organization-admin controller namespace', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        OrganizationTeacherTransfersController,
      ),
    ).toBe('organization-admin/teachers');
  });

  it('locks POST :teacherId/transfer with 200 OK', () => {
    const method = OrganizationTeacherTransfersController.prototype.transfer;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ':teacherId/transfer',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(HttpStatus.OK);
  });

  it('requires OrganizationManagementOnly on the controller', () => {
    expect(
      Reflect.getMetadata(
        ORGANIZATION_MANAGEMENT_ONLY_METADATA,
        OrganizationTeacherTransfersController,
      ),
    ).toBe(true);
  });

  it('reuses teachers.records.manage only', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        OrganizationTeacherTransfersController.prototype.transfer,
      ),
    ).toEqual(['teachers.records.manage']);
  });

  it('accepts the minimum complete destination command', () => {
    expect(errors(validInput())).toEqual([]);
  });

  it.each([
    'destinationSchoolId',
    'teacherCode',
    'firstNameAr',
    'lastNameAr',
    'firstNameEn',
    'lastNameEn',
    'preferredDisplayLanguage',
    'gender',
  ])('requires %s', (field) => {
    const input = validInput();
    delete input[field];
    expect(errors(input).length).toBeGreaterThan(0);
  });

  it('accepts nullable destination-owned fields and canonical weekdays', () => {
    expect(
      errors({
        ...validInput(),
        department: null,
        specialization: null,
        employmentType: null,
        experienceYears: null,
        hireDate: null,
        workingDays: [TeacherWorkDay.SUNDAY, TeacherWorkDay.MONDAY],
        workStartTime: null,
        workEndTime: null,
        notesAr: null,
        notesEn: null,
      }),
    ).toEqual([]);
  });

  it.each([
    'employmentStatus',
    'accountStatus',
    'membershipStatus',
    'loginEmail',
    'username',
    'contactEmail',
    'phone',
    'password',
    'passwordHash',
    'temporaryPassword',
    'credentialVersion',
    'roleId',
    'userType',
    'organizationId',
    'sourceSchoolId',
    'sourceUserId',
    'sourceMembershipId',
    'destinationOrganizationId',
    'assignments',
    'avatar',
    'deletedAt',
  ])('strictly rejects forbidden field %s', (field) => {
    expect(
      errors({ ...validInput(), [field]: 'forbidden' }).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [{ destinationSchoolId: 'not-a-uuid' }, 'destinationSchoolId'],
    [{ teacherCode: '' }, 'teacherCode'],
    [{ preferredDisplayLanguage: 'FR' }, 'preferredDisplayLanguage'],
    [{ gender: 'OTHER' }, 'gender'],
    [{ experienceYears: 61 }, 'experienceYears'],
    [{ hireDate: '2026/07/20' }, 'hireDate'],
    [
      { workingDays: [TeacherWorkDay.SUNDAY, TeacherWorkDay.SUNDAY] },
      'workingDays',
    ],
    [{ workStartTime: '25:00' }, 'workStartTime'],
  ])('rejects invalid %s input', (override) => {
    expect(errors({ ...validInput(), ...override }).length).toBeGreaterThan(0);
  });

  it('keeps transfer not-found details empty', () => {
    const error = new TeacherTransferNotFoundException();
    expect(error).toEqual(
      expect.objectContaining({
        code: 'teachers.lifecycle.transfer_not_found',
        httpStatus: 404,
        details: undefined,
      }),
    );
  });

  it.each(TEACHER_TRANSFER_REASON_CODES)(
    'keeps conflict reason %s stable and bounded',
    (reasonCode) => {
      const error = new TeacherTransferConflictException(reasonCode);
      expect(error.details).toEqual({ reasonCode });
      expect(Object.keys(error.details ?? {})).toEqual(['reasonCode']);
    },
  );

  it('registers global guards in the locked order', () => {
    const source = readFileSync(join(root, 'app.module.ts'), 'utf8');
    const jwt = source.indexOf('useClass: JwtAuthGuard');
    const scope = source.indexOf('useClass: ScopeResolverGuard');
    const organization = source.indexOf('useClass: OrganizationScopeGuard');
    const permissions = source.indexOf('useClass: PermissionsGuard');
    expect(jwt).toBeGreaterThan(-1);
    expect(jwt).toBeLessThan(scope);
    expect(scope).toBeLessThan(organization);
    expect(organization).toBeLessThan(permissions);
  });

  it('does not use PlatformScope or SchoolManagementOnly on the route', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/controller/organization-teacher-transfers.controller.ts',
      ),
      'utf8',
    );
    expect(source).not.toContain('PlatformScope');
    expect(source).not.toContain('SchoolManagementOnly');
    expect(source).not.toContain('platformBypassScope');
  });

  it('contains no current-School transfer route', () => {
    const source = readFileSync(
      join(
        root,
        'modules/teachers/directory/controller/teachers.controller.ts',
      ),
      'utf8',
    );
    expect(source).not.toContain("@Post(':teacherId/transfer')");
  });

  it('uses only parameterized tagged raw queries in the narrow repository', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations.ts',
      ),
      'utf8',
    );
    expect(source).toContain('Prisma.sql`');
    expect(source).toContain('FOR UPDATE');
    expect(source).not.toContain('$queryRawUnsafe');
    expect(source).not.toContain('platformBypassScope');
  });

  it('resolves both owned resources before classifying safe 404', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(
      /const \[sourceLocks, destinationLocks\] = await Promise\.all/gu,
    );
    expect(
      source.indexOf('if (!sourceLock || !destinationLock)'),
    ).toBeGreaterThan(source.indexOf('const [sourceLocks, destinationLocks]'));
  });

  it('locks the actor and permission relationship during revalidation', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations.ts',
      ),
      'utf8',
    );
    expect(source).toContain('FOR UPDATE OF u, m, o, r, rp');
    expect(source).toContain("p.code = 'teachers.records.manage'");
    expect(source).toContain('LIMIT 2');
  });

  it('revalidates destination Role scope while holding the Role lock', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/infrastructure/organization-teacher-transfer-transaction.operations.ts',
      ),
      'utf8',
    );
    expect(source).toContain('r.school_id = ${destination.schoolId}::uuid');
    expect(source).toContain('r.school_id IS NULL AND r.is_system = TRUE');
  });

  it('contains no allocation, timetable, lesson, or homework mutation delegate', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/application/transfer-teacher-between-schools.coordinator.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /(allocation|timetable|lesson|homework)\.(create|update|updateMany|delete|deleteMany|upsert)/u,
    );
  });

  it('contains no hard delete or source Profile school mutation', () => {
    const source = readFileSync(
      join(
        root,
        'modules/organization-admin/teacher-transfers/application/transfer-teacher-between-schools.coordinator.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/\.delete(Many)?\(/u);
    expect(source).not.toMatch(/profile\.update\([\s\S]*schoolId/u);
  });
});
