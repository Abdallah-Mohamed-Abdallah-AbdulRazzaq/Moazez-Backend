import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  PublishCommunicationAnnouncementUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from '../../../communication/application/communication-announcement.use-cases';
import type {
  CommunicationAnnouncementAudienceRowDto,
  UpdateCommunicationAnnouncementDto,
} from '../../../communication/dto/communication-announcement.dto';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  buildTeacherAnnouncementMetadata,
  mapTeacherAnnouncementPriorityToCore,
  normalizeTeacherAnnouncementAudience,
  parseTeacherAnnouncementMetadata,
  resolveTeacherAnnouncementTarget,
  type TeacherAnnouncementAudience,
  type TeacherAnnouncementResolvedTarget,
} from '../domain/teacher-announcement-app-domain';
import {
  CreateTeacherAnnouncementDto,
  ListTeacherAnnouncementsQueryDto,
  TeacherAnnouncementResponseDto,
  TeacherAnnouncementsListResponseDto,
  UpdateTeacherAnnouncementDto,
} from '../dto/teacher-announcements.dto';
import {
  TeacherAnnouncementAudienceRow,
  TeacherAnnouncementRecord,
  TeacherAnnouncementsReadAdapter,
} from '../infrastructure/teacher-announcements-read.adapter';
import { TeacherAnnouncementsPresenter } from '../presenters/teacher-announcements.presenter';

@Injectable()
export class ListTeacherAnnouncementsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
  ) {}

  async execute(
    query: ListTeacherAnnouncementsQueryDto = {},
  ): Promise<TeacherAnnouncementsListResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations = await this.accessService.listOwnedTeacherAllocations();
    const result =
      await this.announcementsReadAdapter.listTeacherAnnouncements({
        context,
        allocations,
        filters: query,
      });

    return TeacherAnnouncementsPresenter.presentList(result);
  }
}

@Injectable()
export class GetTeacherAnnouncementUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
  ) {}

  async execute(announcementId: string): Promise<TeacherAnnouncementResponseDto> {
    const { context, allocations } = await getTeacherAnnouncementScope(
      this.accessService,
    );
    const announcement = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    return TeacherAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}

@Injectable()
export class CreateTeacherAnnouncementUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
    private readonly createAnnouncementUseCase: CreateCommunicationAnnouncementUseCase,
    private readonly publishAnnouncementUseCase: PublishCommunicationAnnouncementUseCase,
  ) {}

  async execute(
    dto: CreateTeacherAnnouncementDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    const { context, allocations } = await getTeacherAnnouncementScope(
      this.accessService,
    );
    const target = resolveTeacherAnnouncementTarget({
      target: dto.target,
      allocations,
    });
    const audience = normalizeTeacherAnnouncementAudience(dto.audience);
    const audienceRows = await this.resolveAudienceRows(target, audience);
    const created = await this.createAnnouncementUseCase.execute({
      title: dto.title,
      body: dto.body,
      status: 'draft',
      priority: mapTeacherAnnouncementPriorityToCore(dto.priority),
      audienceType: 'custom',
      audiences: audienceRows,
      metadata: buildTeacherAnnouncementMetadata({ target, audience }),
    });

    if (dto.publishNow === true) {
      await this.publishAnnouncementUseCase.execute(created.id);
    }

    const announcement = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId: created.id,
    });

    return TeacherAnnouncementsPresenter.presentAnnouncement(announcement);
  }

  private resolveAudienceRows(
    target: TeacherAnnouncementResolvedTarget,
    audience: TeacherAnnouncementAudience,
  ): Promise<CommunicationAnnouncementAudienceRowDto[]> {
    return this.announcementsReadAdapter.resolveAudienceRowsForClassroom({
      classroomId: target.classroomId,
      audience,
    });
  }
}

@Injectable()
export class UpdateTeacherAnnouncementUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
    private readonly updateAnnouncementUseCase: UpdateCommunicationAnnouncementUseCase,
  ) {}

  async execute(
    announcementId: string,
    dto: UpdateTeacherAnnouncementDto,
  ): Promise<TeacherAnnouncementResponseDto> {
    const { context, allocations } = await getTeacherAnnouncementScope(
      this.accessService,
    );
    const existing = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });
    const command = await buildUpdateCommand({
      dto,
      existing,
      allocations,
      announcementsReadAdapter: this.announcementsReadAdapter,
    });

    await this.updateAnnouncementUseCase.execute(announcementId, command);

    const announcement = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    return TeacherAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}

@Injectable()
export class PublishTeacherAnnouncementUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
    private readonly publishAnnouncementUseCase: PublishCommunicationAnnouncementUseCase,
  ) {}

  async execute(announcementId: string): Promise<TeacherAnnouncementResponseDto> {
    const { context, allocations } = await getTeacherAnnouncementScope(
      this.accessService,
    );
    await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    await this.publishAnnouncementUseCase.execute(announcementId);

    const announcement = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    return TeacherAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}

@Injectable()
export class ArchiveTeacherAnnouncementUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly announcementsReadAdapter: TeacherAnnouncementsReadAdapter,
    private readonly archiveAnnouncementUseCase: ArchiveCommunicationAnnouncementUseCase,
  ) {}

  async execute(announcementId: string): Promise<TeacherAnnouncementResponseDto> {
    const { context, allocations } = await getTeacherAnnouncementScope(
      this.accessService,
    );
    await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    await this.archiveAnnouncementUseCase.execute(announcementId);

    const announcement = await requireTeacherAnnouncement({
      announcementsReadAdapter: this.announcementsReadAdapter,
      context,
      allocations,
      announcementId,
    });

    return TeacherAnnouncementsPresenter.presentAnnouncement(announcement);
  }
}

async function getTeacherAnnouncementScope(
  accessService: TeacherAppAccessService,
): Promise<{
  context: TeacherAppContext;
  allocations: TeacherAppAllocationRecord[];
}> {
  const context = accessService.assertCurrentTeacher();
  const allocations = await accessService.listOwnedTeacherAllocations();

  return { context, allocations };
}

async function requireTeacherAnnouncement(params: {
  announcementsReadAdapter: TeacherAnnouncementsReadAdapter;
  context: TeacherAppContext;
  allocations: TeacherAppAllocationRecord[];
  announcementId: string;
}): Promise<TeacherAnnouncementRecord> {
  const announcement =
    await params.announcementsReadAdapter.findTeacherAnnouncement({
      context: params.context,
      allocations: params.allocations,
      announcementId: params.announcementId,
    });

  if (!announcement) {
    throw new NotFoundDomainException('Teacher announcement not found', {
      announcementId: params.announcementId,
    });
  }

  return announcement;
}

async function buildUpdateCommand(params: {
  dto: UpdateTeacherAnnouncementDto;
  existing: TeacherAnnouncementRecord;
  allocations: TeacherAppAllocationRecord[];
  announcementsReadAdapter: TeacherAnnouncementsReadAdapter;
}): Promise<UpdateCommunicationAnnouncementDto> {
  const metadata = parseTeacherAnnouncementMetadata(params.existing.metadata);
  if (!metadata) {
    throw new NotFoundDomainException('Teacher announcement not found', {
      announcementId: params.existing.id,
    });
  }

  const currentTarget: TeacherAnnouncementResolvedTarget = {
    type: 'classroom',
    classId: metadata.teacherApp.classId,
    classroomId: metadata.teacherApp.classroomId,
    label: metadata.teacherApp.label,
  };
  const nextTarget = params.dto.target
    ? resolveTeacherAnnouncementTarget({
        target: params.dto.target,
        allocations: params.allocations,
      })
    : currentTarget;
  const nextAudience = params.dto.audience
    ? normalizeTeacherAnnouncementAudience(params.dto.audience)
    : metadata.teacherApp.audience;
  const shouldReplaceAudience =
    params.dto.target !== undefined || params.dto.audience !== undefined;
  const audienceRows = shouldReplaceAudience
    ? await params.announcementsReadAdapter.resolveAudienceRowsForClassroom({
        classroomId: nextTarget.classroomId,
        audience: nextAudience,
      })
    : undefined;

  return {
    ...(params.dto.title !== undefined ? { title: params.dto.title } : {}),
    ...(params.dto.body !== undefined ? { body: params.dto.body } : {}),
    ...(params.dto.priority !== undefined
      ? { priority: mapTeacherAnnouncementPriorityToCore(params.dto.priority) }
      : {}),
    ...(shouldReplaceAudience
      ? {
          audienceType: 'custom',
          audiences: audienceRows as TeacherAnnouncementAudienceRow[],
          metadata: buildTeacherAnnouncementMetadata({
            target: nextTarget,
            audience: nextAudience,
          }),
        }
      : {}),
  };
}
