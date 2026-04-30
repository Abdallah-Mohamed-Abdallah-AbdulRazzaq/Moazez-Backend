import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { requireBehaviorScope } from '../behavior-context';
import {
  assertBehaviorCategoryCanChangeIdentity,
  assertBehaviorCategoryCanDelete,
  isUniqueConstraintError,
} from '../domain/behavior-category-domain';
import {
  CreateBehaviorCategoryDto,
  DeleteBehaviorCategoryResponseDto,
  ListBehaviorCategoriesQueryDto,
  UpdateBehaviorCategoryDto,
} from '../dto/behavior-category.dto';
import { BehaviorCategoriesRepository } from '../infrastructure/behavior-categories.repository';
import {
  presentBehaviorCategory,
  presentBehaviorCategoryList,
} from '../presenters/behavior-category.presenter';
import {
  buildBehaviorCategoryAuditEntry,
  buildCreateBehaviorCategoryInput,
  buildUpdateBehaviorCategoryInput,
  normalizeBehaviorCategoryListFilters,
  resolveBehaviorCategoryIdentityChanges,
} from './behavior-category-use-case.helpers';

@Injectable()
export class ListBehaviorCategoriesUseCase {
  constructor(
    private readonly behaviorCategoriesRepository: BehaviorCategoriesRepository,
  ) {}

  async execute(query: ListBehaviorCategoriesQueryDto) {
    requireBehaviorScope();
    const filters = normalizeBehaviorCategoryListFilters(query);
    const result =
      await this.behaviorCategoriesRepository.listCategories(filters);

    return presentBehaviorCategoryList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
      includeDeleted: filters.includeDeleted ?? false,
    });
  }
}

@Injectable()
export class GetBehaviorCategoryUseCase {
  constructor(
    private readonly behaviorCategoriesRepository: BehaviorCategoriesRepository,
  ) {}

  async execute(categoryId: string) {
    requireBehaviorScope();
    const category =
      await this.behaviorCategoriesRepository.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundDomainException('Behavior category not found', {
        categoryId,
      });
    }

    return presentBehaviorCategory(category);
  }
}

@Injectable()
export class CreateBehaviorCategoryUseCase {
  constructor(
    private readonly behaviorCategoriesRepository: BehaviorCategoriesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateBehaviorCategoryDto) {
    const scope = requireBehaviorScope();
    const input = await buildCreateBehaviorCategoryInput({
      scope,
      repository: this.behaviorCategoriesRepository,
      command,
    });

    try {
      const category =
        await this.behaviorCategoriesRepository.createCategory(input);
      await this.authRepository.createAuditLog(
        buildBehaviorCategoryAuditEntry({
          scope,
          action: 'behavior.category.create',
          category,
        }),
      );

      return presentBehaviorCategory(category);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationDomainException(
          'Behavior category code already exists',
          {
            field: 'code',
            code: input.category.code,
          },
        );
      }

      throw error;
    }
  }
}

@Injectable()
export class UpdateBehaviorCategoryUseCase {
  constructor(
    private readonly behaviorCategoriesRepository: BehaviorCategoriesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(categoryId: string, command: UpdateBehaviorCategoryDto) {
    const scope = requireBehaviorScope();
    const existing =
      await this.behaviorCategoriesRepository.findCategoryById(categoryId);
    if (!existing) {
      throw new NotFoundDomainException('Behavior category not found', {
        categoryId,
      });
    }

    const identityChanges = resolveBehaviorCategoryIdentityChanges({
      existing,
      command,
    });
    if (identityChanges.changedFields.length > 0) {
      const usage = await this.behaviorCategoriesRepository.countCategoryUsage(
        existing.id,
      );
      assertBehaviorCategoryCanChangeIdentity({
        categoryId: existing.id,
        usage,
        changedFields: identityChanges.changedFields,
      });
    }

    const input = await buildUpdateBehaviorCategoryInput({
      scope,
      repository: this.behaviorCategoriesRepository,
      existing,
      command,
    });

    try {
      const category =
        await this.behaviorCategoriesRepository.updateCategory(input);
      await this.authRepository.createAuditLog(
        buildBehaviorCategoryAuditEntry({
          scope,
          action: 'behavior.category.update',
          category,
          before: existing,
        }),
      );

      return presentBehaviorCategory(category);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationDomainException(
          'Behavior category code already exists',
          {
            field: 'code',
            code: input.data.code ?? identityChanges.nextCode,
          },
        );
      }

      throw error;
    }
  }
}

@Injectable()
export class DeleteBehaviorCategoryUseCase {
  constructor(
    private readonly behaviorCategoriesRepository: BehaviorCategoriesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    categoryId: string,
  ): Promise<DeleteBehaviorCategoryResponseDto> {
    const scope = requireBehaviorScope();
    const existing =
      await this.behaviorCategoriesRepository.findCategoryById(categoryId);
    if (!existing) {
      throw new NotFoundDomainException('Behavior category not found', {
        categoryId,
      });
    }

    const usage = await this.behaviorCategoriesRepository.countCategoryUsage(
      existing.id,
    );
    assertBehaviorCategoryCanDelete({
      categoryId: existing.id,
      usage,
    });

    const category = await this.behaviorCategoriesRepository.softDeleteCategory(
      {
        schoolId: scope.schoolId,
        categoryId: existing.id,
      },
    );
    await this.authRepository.createAuditLog(
      buildBehaviorCategoryAuditEntry({
        scope,
        action: 'behavior.category.delete',
        category,
        before: existing,
        usage,
      }),
    );

    return { ok: true };
  }
}
