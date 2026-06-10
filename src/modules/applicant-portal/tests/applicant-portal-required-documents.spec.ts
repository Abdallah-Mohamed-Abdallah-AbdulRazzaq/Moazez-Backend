import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { ListAdmissionRequiredDocumentsUseCase } from '../application/list-admission-required-documents.use-case';
import {
  AdmissionRequiredDocumentRecord,
  ApplicantPortalRepository,
} from '../infrastructure/applicant-portal.repository';
import { presentAdmissionRequiredDocumentsList } from '../presenters/admission-required-documents.presenter';

const SCHOOL_ID = '00000000-0000-0000-0000-000000000101';
const DOCUMENT_ID = '00000000-0000-0000-0000-000000000201';

describe('Applicant Portal required documents', () => {
  it('uses explicit active document filters and deterministic ordering', async () => {
    const prisma = {
      admissionRequiredDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new ApplicantPortalRepository(prisma as never);

    await repository.listActiveAdmissionRequiredDocumentsForSchool(SCHOOL_ID);

    expect(prisma.admissionRequiredDocument.findMany).toHaveBeenCalledWith({
      where: {
        schoolId: SCHOOL_ID,
        gradeId: null,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        isMandatory: true,
        acceptedFileTypes: true,
        maxFiles: true,
        sortOrder: true,
      },
    });
  });

  it('checks school discoverability before listing required documents', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolById.mockResolvedValue(
      discoverableSchoolFixture(),
    );
    repository.listActiveAdmissionRequiredDocumentsForSchool.mockResolvedValue([
      requiredDocumentFixture(),
    ]);
    const useCase = new ListAdmissionRequiredDocumentsUseCase(repository);

    const response = await useCase.execute(SCHOOL_ID);

    expect(repository.findDiscoverableSchoolById).toHaveBeenCalledWith(
      SCHOOL_ID,
    );
    expect(
      repository.listActiveAdmissionRequiredDocumentsForSchool,
    ).toHaveBeenCalledWith(SCHOOL_ID);
    expect(response.data).toHaveLength(1);
  });

  it('returns an empty data array when the discoverable school has no documents', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolById.mockResolvedValue(
      discoverableSchoolFixture(),
    );
    repository.listActiveAdmissionRequiredDocumentsForSchool.mockResolvedValue(
      [],
    );
    const useCase = new ListAdmissionRequiredDocumentsUseCase(repository);

    await expect(useCase.execute(SCHOOL_ID)).resolves.toEqual({ data: [] });
  });

  it('returns not found for nonexistent or non-discoverable schools', async () => {
    const repository = mockApplicantRepository();
    repository.findDiscoverableSchoolById.mockResolvedValue(null);
    const useCase = new ListAdmissionRequiredDocumentsUseCase(repository);

    await expect(useCase.execute(SCHOOL_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(
      repository.listActiveAdmissionRequiredDocumentsForSchool,
    ).not.toHaveBeenCalled();
  });

  it('presents only applicant-safe document fields', () => {
    const response = presentAdmissionRequiredDocumentsList([
      requiredDocumentFixture({
        schoolId: SCHOOL_ID,
        organizationId: '00000000-0000-0000-0000-000000000301',
        gradeId: '00000000-0000-0000-0000-000000000401',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-06-09T10:00:00.000Z'),
        updatedAt: new Date('2026-06-09T10:05:00.000Z'),
      } as unknown as Partial<AdmissionRequiredDocumentRecord>),
    ]);

    expect(response).toEqual({
      data: [
        {
          id: DOCUMENT_ID,
          title: 'Birth certificate',
          description: 'Clear scanned copy',
          isMandatory: true,
          acceptedFileTypes: ['application/pdf', 'image/jpeg'],
          maxFiles: 1,
          sortOrder: 10,
        },
      ],
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'gradeId',
      'isActive',
      'deletedAt',
      'createdAt',
      'updatedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('normalizes accepted file types and blank descriptions', () => {
    const response = presentAdmissionRequiredDocumentsList([
      requiredDocumentFixture({
        title: '  Parent   ID ',
        description: '   ',
        acceptedFileTypes: [
          ' application/pdf ',
          '',
          'image/png',
          'application/pdf',
        ],
      }),
    ]);

    expect(response.data[0]).toMatchObject({
      title: 'Parent ID',
      description: null,
      acceptedFileTypes: ['application/pdf', 'image/png'],
    });
  });
});

function discoverableSchoolFixture() {
  return {
    id: SCHOOL_ID,
    name: 'Moazez Academy',
    status: SchoolStatus.ACTIVE,
    organization: {
      status: OrganizationStatus.ACTIVE,
      deletedAt: null,
    },
    schoolProfile: null,
  } as never;
}

function requiredDocumentFixture(
  overrides?: Partial<AdmissionRequiredDocumentRecord>,
): AdmissionRequiredDocumentRecord {
  return {
    id: DOCUMENT_ID,
    title: ' Birth   certificate ',
    description: ' Clear   scanned copy ',
    isMandatory: true,
    acceptedFileTypes: [
      ' application/pdf ',
      'image/jpeg',
      'application/pdf',
      '',
    ],
    maxFiles: 1,
    sortOrder: 10,
    ...overrides,
  } as AdmissionRequiredDocumentRecord;
}

function mockApplicantRepository(): jest.Mocked<ApplicantPortalRepository> {
  return {
    findDiscoverableSchoolById: jest.fn(),
    listActiveAdmissionRequiredDocumentsForSchool: jest.fn(),
  } as unknown as jest.Mocked<ApplicantPortalRepository>;
}
