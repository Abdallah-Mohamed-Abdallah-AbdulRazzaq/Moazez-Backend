import { Injectable } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

@Injectable()
export class TemporaryDiskProbe {
  async checkReadiness(): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'moazez-probe-'));
    try {
      await writeFile(join(directory, 'writable'), '', {
        encoding: 'utf8',
        flag: 'wx',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}
