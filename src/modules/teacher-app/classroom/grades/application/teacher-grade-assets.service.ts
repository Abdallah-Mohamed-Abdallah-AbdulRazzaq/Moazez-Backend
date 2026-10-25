import { Injectable } from '@nestjs/common';
import { GradeAssetsService } from '../../../../grades/assessments/application/grade-assets.service';
import type { GradeAssetResource } from '../../../../grades/assessments/domain/grade-asset';
import type {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
} from '../../../../grades/assessments/dto/grade-asset.dto';
import type { PrivateMediaContentRequest } from '../../../../../infrastructure/storage/private-media-content.service';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';

type Resource = GradeAssetResource & { classId: string };
@Injectable()
export class TeacherGradeAssetsService {
  constructor(
    private readonly ownership: TeacherAppAccessService,
    private readonly assets: GradeAssetsService,
  ) {}
  private async actor(input: Resource) {
    await this.ownership.assertTeacherOwnsAllocation(input.classId);
    return { surface: 'teacher' as const, classId: input.classId };
  }
  async list(input: Resource) {
    return this.assets.list(await this.actor(input), input);
  }
  async get(input: Resource & { assetId: string }) {
    return this.assets.get(await this.actor(input), input);
  }
  async create(input: Resource, dto: CreateGradeAssetDto) {
    return this.assets.create(await this.actor(input), input, dto);
  }
  async update(
    input: Resource & { assetId: string },
    dto: UpdateGradeAssetDto,
  ) {
    return this.assets.update(await this.actor(input), input, dto);
  }
  async reorder(
    input: Resource & { assetId: string },
    dto: ReorderGradeAssetDto,
  ) {
    return this.assets.reorder(await this.actor(input), input, dto);
  }
  async remove(input: Resource & { assetId: string }) {
    return this.assets.remove(await this.actor(input), input);
  }
  openContent(
    input: Resource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.assets.openContent(() => this.actor(input), input, request);
  }
}
