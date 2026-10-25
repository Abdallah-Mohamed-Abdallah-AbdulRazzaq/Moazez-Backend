import { Injectable } from '@nestjs/common';
import { HomeworkQuestionAssetsService } from '../../../homework/application/homework-question-assets.service';
import type { HomeworkAssetResource } from '../../../homework/domain/homework-question-asset';
import type {
  CreateHomeworkQuestionAssetDto,
  UpdateHomeworkQuestionAssetDto,
  ReorderHomeworkQuestionAssetDto,
} from '../../../homework/dto/homework-question-asset.dto';
import type { PrivateMediaContentRequest } from '../../../../infrastructure/storage/private-media-content.service';
import { TeacherHomeworkOwnershipService } from './teacher-homework-ownership.service';

type Resource = HomeworkAssetResource & { classId: string };
@Injectable()
export class TeacherHomeworkQuestionAssetsService {
  constructor(
    private readonly ownership: TeacherHomeworkOwnershipService,
    private readonly assets: HomeworkQuestionAssetsService,
  ) {}
  private async actor(input: Resource) {
    await this.ownership.resolveOwnedHomework({
      classId: input.classId,
      homeworkId: input.homeworkId,
    });
    return { surface: 'teacher' as const, classId: input.classId };
  }
  async list(input: Resource) {
    return this.assets.list(await this.actor(input), input);
  }
  async get(input: Resource & { assetId: string }) {
    return this.assets.get(await this.actor(input), input);
  }
  async create(input: Resource, dto: CreateHomeworkQuestionAssetDto) {
    return this.assets.create(await this.actor(input), input, dto);
  }
  async update(
    input: Resource & { assetId: string },
    dto: UpdateHomeworkQuestionAssetDto,
  ) {
    return this.assets.update(await this.actor(input), input, dto);
  }
  async reorder(
    input: Resource & { assetId: string },
    dto: ReorderHomeworkQuestionAssetDto,
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
