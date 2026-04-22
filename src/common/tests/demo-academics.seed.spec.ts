import { PrismaClient } from '@prisma/client';
import { ensureDemoAcademicYear } from '../../../prisma/seeds/05-demo-academics.seed';

describe('ensureDemoAcademicYear', () => {
  it('keeps the demo year inactive when another active year already exists', async () => {
    const transactionClient = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: 'demo-year' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'other-active-year' }),
        upsert: jest.fn().mockResolvedValue({
          id: 'demo-year',
          isActive: false,
        }),
      },
    };

    const prisma = {
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    } as unknown as PrismaClient;

    const result = await ensureDemoAcademicYear(prisma, 'school-1');

    expect(result).toEqual({ id: 'demo-year', isActive: false });
    expect(transactionClient.academicYear.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ isActive: false }),
        create: expect.objectContaining({
          schoolId: 'school-1',
          isActive: false,
        }),
      }),
    );
  });

  it('activates the demo year when the school has no active year', async () => {
    const transactionClient = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'demo-year',
          isActive: true,
        }),
      },
    };

    const prisma = {
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    } as unknown as PrismaClient;

    const result = await ensureDemoAcademicYear(prisma, 'school-1');

    expect(result).toEqual({ id: 'demo-year', isActive: true });
    expect(transactionClient.academicYear.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ isActive: true }),
        create: expect.objectContaining({
          schoolId: 'school-1',
          isActive: true,
        }),
      }),
    );
  });
});
