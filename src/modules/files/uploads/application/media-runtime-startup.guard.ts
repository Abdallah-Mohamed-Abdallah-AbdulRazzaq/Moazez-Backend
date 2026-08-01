import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRequire } from 'node:module';
import { join } from 'node:path';

type RuntimeContract = {
  executablePath: string;
  expectedFirstVersionLine: string;
  verificationVersion: string;
  timeoutMs: number;
  maximumStdoutBytes: number;
  maximumStderrBytes: number;
  maximumTotalOutputBytes: number;
  protocolWhitelist: string;
};

type RuntimeContractModule = {
  MEDIA_RUNTIME_CONTRACT: RuntimeContract;
  verifyRuntimeIdentity(input: {
    executablePath: string;
    verificationVersion: string;
    timeoutMs: number;
    maximumTotalOutputBytes: number;
  }): Promise<{ firstLine: string; verificationVersion: string }>;
};

const runtime = createRequire(__filename)(
  join(process.cwd(), 'scripts/media-runtime-contract.cjs'),
) as RuntimeContractModule;

@Injectable()
export class MediaRuntimeStartupGuard implements OnModuleInit {
  private verified = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const isTest = this.config.get<string>('NODE_ENV') === 'test';
    const enforceInTest =
      this.config.get<boolean>('MEDIA_RUNTIME_ENFORCE_IN_TEST') === true;
    if (isTest && !enforceInTest) {
      this.verified = true;
      return;
    }
    await this.verify();
  }

  async assertReady(): Promise<void> {
    if (!this.verified) await this.verify();
  }

  isVerified(): boolean {
    return this.verified;
  }

  private async verify(): Promise<void> {
    await runtime.verifyRuntimeIdentity({
      executablePath: this.config.getOrThrow<string>('FFPROBE_PATH'),
      verificationVersion: this.config.getOrThrow<string>(
        'MEDIA_VERIFICATION_VERSION',
      ),
      timeoutMs: this.config.getOrThrow<number>('FFPROBE_TIMEOUT_MS'),
      maximumTotalOutputBytes: this.config.getOrThrow<number>(
        'FFPROBE_MAX_OUTPUT_BYTES',
      ),
    });
    this.verified = true;
  }
}

export const MEDIA_RUNTIME_CONTRACT = runtime.MEDIA_RUNTIME_CONTRACT;
