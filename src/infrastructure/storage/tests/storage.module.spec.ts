import { ConfigService } from '@nestjs/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GcsAdapter } from '../gcs.adapter';
import { MinioAdapter } from '../minio.adapter';
import { createObjectStoragePort } from '../storage.module';

describe('StorageModule provider selection', () => {
  it.each(['minio', 's3'])(
    'selects the MinIO-compatible adapter for %s without touching GCS config',
    (provider) => {
      const config = providerConfig({ STORAGE_PROVIDER: provider });

      expect(createObjectStoragePort(config)).toBeInstanceOf(MinioAdapter);
      expect(config.getOrThrow).not.toHaveBeenCalledWith('GCP_PROJECT_ID');
      expect(config.getOrThrow).not.toHaveBeenCalledWith(
        'GCS_SIGNING_SERVICE_ACCOUNT',
      );
    },
  );

  it('selects GCS without eagerly reading or initializing signer configuration', () => {
    const config = providerConfig({
      STORAGE_PROVIDER: 'gcs',
      GCP_PROJECT_ID: 'moazez-test-project',
    });

    expect(createObjectStoragePort(config)).toBeInstanceOf(GcsAdapter);
    expect(config.getOrThrow).not.toHaveBeenCalledWith(
      'GCS_SIGNING_SERVICE_ACCOUNT',
    );
    expect(config.getOrThrow).not.toHaveBeenCalledWith('STORAGE_ENDPOINT');
  });

  it('keeps feature/application code independent of provider selection', () => {
    const moduleRoot = join(process.cwd(), 'src', 'modules');
    const productionSources = walkTypeScriptFiles(moduleRoot).filter(
      (path) => !path.endsWith('.spec.ts'),
    );

    for (const path of productionSources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(
        /STORAGE_PROVIDER|MinioAdapter|GcsAdapter|ObjectStoragePort|OBJECT_STORAGE_PORT/u,
      );
    }
  });
});

function providerConfig(overrides: Record<string, string>): ConfigService & {
  getOrThrow: jest.Mock;
} {
  const values: Record<string, string> = {
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'test-access',
    STORAGE_SECRET_KEY: 'test-secret',
    ...overrides,
  };
  return {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService & { getOrThrow: jest.Mock };
}

function walkTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}
