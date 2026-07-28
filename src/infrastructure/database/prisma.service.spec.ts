import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('shares one disconnect across repeated lifecycle calls', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    const first = service.onModuleDestroy();
    const second = service.onModuleDestroy();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
