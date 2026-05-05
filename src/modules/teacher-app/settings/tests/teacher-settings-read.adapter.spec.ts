import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherSettingsReadAdapter } from '../infrastructure/teacher-settings-read.adapter';

describe('TeacherSettingsReadAdapter', () => {
  it('reads school profile safely without selecting raw logo fields', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.schoolProfile.findFirst.mockResolvedValue({
      schoolName: 'Moazez Academy',
      shortName: 'MA',
      formattedAddress: '123 School St',
      addressLine: null,
      city: 'Cairo',
      country: 'Egypt',
    });
    prismaMocks.school.findFirst.mockResolvedValue({ name: 'Fallback School' });

    const result = await adapter.findSchoolSettings({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    });

    expect(result).toEqual({
      name: 'Moazez Academy',
      logoUrl: null,
      email: null,
      phone: null,
      address: '123 School St',
    });
    expect(
      JSON.stringify(prismaMocks.schoolProfile.findFirst.mock.calls[0][0].select),
    ).not.toContain('logoUrl');
  });

  it('falls back to school name and location-only address when profile display fields are absent', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.schoolProfile.findFirst.mockResolvedValue({
      schoolName: null,
      shortName: null,
      formattedAddress: null,
      addressLine: null,
      city: 'Cairo',
      country: 'Egypt',
    });
    prismaMocks.school.findFirst.mockResolvedValue({ name: 'Fallback School' });

    await expect(
      adapter.findSchoolSettings({
        teacherUserId: 'teacher-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        permissions: [],
      }),
    ).resolves.toEqual({
      name: 'Fallback School',
      logoUrl: null,
      email: null,
      phone: null,
      address: 'Cairo, Egypt',
    });
  });

  it('remains read-only and does not mutate settings', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.schoolProfile.findFirst.mockResolvedValue(null);
    prismaMocks.school.findFirst.mockResolvedValue(null);

    await adapter.findSchoolSettings({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    });

    expect(prismaMocks.schoolProfile.create).not.toHaveBeenCalled();
    expect(prismaMocks.schoolProfile.update).not.toHaveBeenCalled();
    expect(prismaMocks.schoolProfile.upsert).not.toHaveBeenCalled();
    expect(prismaMocks.school.update).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherSettingsReadAdapter;
  prismaMocks: {
    schoolProfile: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
    school: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    schoolProfile: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    school: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherSettingsReadAdapter(prisma),
    prismaMocks,
  };
}
