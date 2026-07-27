import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function readIfPresent(relativePath: string): string {
  const path = join(ROOT, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function extractPrismaBlock(
  schema: string,
  kind: 'enum' | 'model',
  name: string,
): string {
  const block = schema.match(
    new RegExp(`${kind} ${name} \\{[\\s\\S]*?\\n\\}`, 'u'),
  )?.[0];

  expect(block).toBeDefined();
  return block ?? '';
}

describe('Lesson content publication lifecycle contract', () => {
  it('declares the publication enum, lifecycle columns, actor relations, and indexes', () => {
    const schema = read('prisma/schema.prisma');
    const publicationEnum = extractPrismaBlock(
      schema,
      'enum',
      'LessonContentPublicationStatus',
    );
    const lessonContentItem = extractPrismaBlock(
      schema,
      'model',
      'LessonContentItem',
    );

    expect(schema).toContain('enum LessonContentPublicationStatus {');
    expect(publicationEnum).toContain('DRAFT');
    expect(publicationEnum).toContain('PUBLISHED');
    expect(publicationEnum).toContain('ARCHIVED');
    expect(publicationEnum).toContain(
      '@@map("lesson_content_publication_status")',
    );
    expect(lessonContentItem).toContain(
      'publicationStatus LessonContentPublicationStatus @default(DRAFT) @map("publication_status")',
    );
    expect(lessonContentItem).toMatch(
      /publishedAt\s+DateTime\?\s+@map\("published_at"\)/u,
    );
    expect(lessonContentItem).toMatch(
      /publishedByUserId\s+String\?\s+@map\("published_by_user_id"\)\s+@db\.Uuid/u,
    );
    expect(lessonContentItem).toMatch(
      /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/u,
    );
    expect(lessonContentItem).toMatch(
      /archivedByUserId\s+String\?\s+@map\("archived_by_user_id"\)\s+@db\.Uuid/u,
    );
    expect(lessonContentItem).toMatch(
      /publishedBy\s+User\?\s+@relation\("LessonContentItemPublishedBy"/u,
    );
    expect(lessonContentItem).toMatch(
      /archivedBy\s+User\?\s+@relation\("LessonContentItemArchivedBy"/u,
    );
    expect(schema).toContain('lessonContentItemsPublished');
    expect(schema).toContain('lessonContentItemsArchived');
    expect(lessonContentItem).toContain('@@index([publishedByUserId])');
    expect(lessonContentItem).toContain('@@index([archivedByUserId])');
    expect(schema).toContain(
      'map: "lesson_content_items_school_publication_lesson_order_idx"',
    );
    expect(lessonContentItem).toMatch(
      /@@index\(\s*\[\s*schoolId\s*,\s*publicationStatus\s*,\s*lessonId\s*,\s*sortOrder\s*\]\s*,\s*map:\s*"lesson_content_items_school_publication_lesson_order_idx"\s*\)/u,
    );
    expect(schema).not.toContain(
      'lesson_content_items_school_lesson_publication_order_idx',
    );

    const lockedPublicationIndex = lessonContentItem.match(
      /@@index\(\s*\[[^\]]*\]\s*,\s*map:\s*"lesson_content_items_school_publication_lesson_order_idx"\s*\)/u,
    )?.[0];
    expect(lockedPublicationIndex).toBeDefined();
    expect(lockedPublicationIndex).not.toContain('deletedAt');
    expect(lessonContentItem).not.toMatch(
      /@@index\([^\n]*publicationStatus[^\n]*deletedAt[^\n]*lesson_content_items_school_publication_lesson_order_idx/u,
    );
  });

  it('contains one canonical lifecycle migration with backfill and the exact CHECK', () => {
    const migrationsRoot = join(ROOT, 'prisma/migrations');
    const lifecycleDirectories = readdirSync(migrationsRoot).filter((entry) =>
      /^\d{14}_lesson_content_publication_lifecycle$/u.test(entry),
    );

    expect(lifecycleDirectories).toHaveLength(1);
    const migrationPath = join(
      migrationsRoot,
      lifecycleDirectories[0] ?? 'missing',
      'migration.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('lesson_content_publication_status');
    expect(migration).toContain('lesson_content_items_publication_state_check');
    expect(migration).toContain('"publication_status" = \'PUBLISHED\'');
    expect(migration).toContain('"published_at" = "created_at"');
    expect(migration).toContain(
      '"published_by_user_id" = "created_by_user_id"',
    );
    expect(migration).toContain('"publication_status" = \'ARCHIVED\'');
    expect(migration).toContain('"archived_at" = "deleted_at"');
    expect(migration).toContain("SET DEFAULT 'DRAFT'");
    expect(migration).toContain('SET NOT NULL');
  });

  it('registers bodyless publish, unpublish, and archive POST actions', () => {
    const controller = read(
      'src/modules/academics/curriculum/controller/curriculum.controller.ts',
    );

    for (const action of ['publish', 'unpublish', 'archive']) {
      expect(controller).toContain(`content/:contentItemId/${action}',`);
    }
    expect(controller.match(/@HttpCode\(HttpStatus\.OK\)/gu)).toHaveLength(5);
    expect(controller).toContain('PublishLessonContentUseCase');
    expect(controller).toContain('UnpublishLessonContentUseCase');
    expect(controller).toContain('ArchiveLessonContentUseCase');
  });

  it('uses expected-state conditional writes for every lifecycle-sensitive mutation', () => {
    const repository = read(
      'src/modules/academics/curriculum/infrastructure/lesson-content.repository.ts',
    );
    const useCases = read(
      'src/modules/academics/curriculum/application/lesson-content.use-cases.ts',
    );

    expect(repository).toContain('expectedPublicationStatus');
    expect(repository).toContain('updateMany');
    expect(repository).toContain('deletedAt: null');
    expect(useCases).toContain('LessonContentPublicationConflictException');
    expect(useCases).toContain('LessonContentPublicationStatus.DRAFT');
    expect(useCases).toContain('LessonContentPublicationStatus.PUBLISHED');
    expect(useCases).toContain('LessonContentPublicationStatus.ARCHIVED');
  });

  it('owns every mutation and success audit inside one narrow transaction boundary', () => {
    const contract = readIfPresent(
      'src/modules/academics/curriculum/application/lesson-content.unit-of-work.ts',
    );
    const implementation = readIfPresent(
      'src/modules/academics/curriculum/infrastructure/prisma-lesson-content.unit-of-work.ts',
    );
    const repository = read(
      'src/modules/academics/curriculum/infrastructure/lesson-content.repository.ts',
    );
    const useCases = read(
      'src/modules/academics/curriculum/application/lesson-content.use-cases.ts',
    );
    const curriculumModule = read(
      'src/modules/academics/curriculum/curriculum.module.ts',
    );

    expect(contract).toContain('abstract class LessonContentUnitOfWork');
    expect(contract).toContain('LessonContentTransactionContext');
    expect(implementation).toContain('this.prisma.$transaction');
    expect(repository).toContain('writeSuccessfulAudit');
    expect(useCases).toContain('lessonContentUnitOfWork.execute');
    expect(useCases).not.toContain('AuthRepository');
    expect(curriculumModule).toContain('PrismaLessonContentUnitOfWork');
  });

  it('locks the exact parent chain and live FILE dependency with parameterized SQL', () => {
    const repository = read(
      'src/modules/academics/curriculum/infrastructure/lesson-content.repository.ts',
    );

    expect(repository).toContain('Prisma.sql');
    expect(
      repository.match(/FOR UPDATE/gu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(repository).toContain('lockLessonContentScope');
    expect(repository).toContain('lockReadyLearningMediaFile');
    expect(repository).toContain('"school_id" = ${schoolId}::uuid');
    expect(repository).not.toMatch(/\$queryRawUnsafe|\$executeRawUnsafe/u);
  });

  it('locks production parent cascades root-first and preserves publication state', () => {
    const repository = read(
      'src/modules/academics/curriculum/infrastructure/curriculum.repository.ts',
    );

    expect(repository).toContain('LessonContentPublicationStatus');
    expect(repository).toContain("status: 'publication_conflict'");
    expect(repository).toContain('Prisma.sql');
    expect(repository).toContain('FOR UPDATE');
    expect(repository).toContain('ORDER BY "id" ASC');
    expect(repository).toContain(
      'publicationStatus: LessonContentPublicationStatus.DRAFT',
    );
    expect(repository).not.toMatch(/\$queryRawUnsafe|\$executeRawUnsafe/u);

    const curriculumDelete = repository.slice(
      repository.indexOf('async softDeleteCurriculum'),
      repository.indexOf('findUnitById'),
    );
    expect(curriculumDelete.indexOf('lockLiveCurriculum(')).toBeLessThan(
      curriculumDelete.indexOf('lockLiveCurriculumUnits('),
    );
    expect(curriculumDelete.indexOf('lockLiveCurriculumUnits(')).toBeLessThan(
      curriculumDelete.indexOf('lockLiveCurriculumLessons('),
    );
    expect(curriculumDelete.indexOf('lockLiveCurriculumLessons(')).toBeLessThan(
      curriculumDelete.indexOf('lockLiveLessonContentItems('),
    );
    expect(repository).toContain('FROM "curricula"');
    expect(repository).toContain('FROM "curriculum_units"');
    expect(repository).toContain('FROM "curriculum_lessons"');
    expect(repository).toContain('FROM "lesson_content_items"');
  });

  it('removes identifiers from not-found details and adds focused CI', () => {
    const exceptions = read(
      'src/modules/academics/curriculum/domain/lesson-content.exceptions.ts',
    );
    const workflow = readIfPresent(
      '.github/workflows/learning-content-integrity.yml',
    );

    expect(exceptions).toContain(
      'export class LessonContentNotFoundException extends DomainException',
    );
    expect(exceptions).toContain(
      'export class LessonContentFileNotFoundException extends DomainException',
    );
    expect(exceptions).not.toMatch(
      /LessonContent(NotFound|FileNotFound)Exception[\s\S]{0,120}constructor\(details/u,
    );
    expect(workflow).toContain('name: Learning Content Integrity');
    expect(workflow).toContain("node-version: '22.23.1'");
    expect(workflow).toContain('postgres:16-alpine');
    expect(workflow).toContain('name: Check migration governance');
    expect(workflow).toContain('run: npm run db:migrations:check');
    expect(workflow).toContain('name: Confirm migration status');
    expect(workflow).toContain('run: npm run db:migrations:status');
    expect(workflow.indexOf('name: Check migration governance')).toBeLessThan(
      workflow.indexOf('name: Validate Prisma schema'),
    );
    expect(workflow.indexOf('name: Deploy existing migrations')).toBeLessThan(
      workflow.indexOf('name: Confirm migration status'),
    );
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('github.event.pull_request.base.sha');
    expect(workflow).toContain('github.event.before');
    expect(workflow).toContain('github.event.repository.default_branch');
    expect(workflow).toContain('git fetch --force --tags origin');
    expect(workflow).toContain('MIGRATION_BASE_REF=$base_commit');
    expect(workflow).toContain(
      'src/modules/academics/curriculum/tests/curriculum.use-case.spec.ts',
    );
    expect(workflow).not.toContain('ffprobe');
  });

  it('gates Student/Parent to PUBLISHED and Teacher to DRAFT or PUBLISHED', () => {
    const student = read(
      'src/modules/student-app/lessons/infrastructure/student-lessons-read.adapter.ts',
    );
    const parent = read(
      'src/modules/parent-app/lessons/infrastructure/parent-child-lessons-read.adapter.ts',
    );
    const teacher = read(
      'src/modules/teacher-app/lesson-preparation/infrastructure/teacher-lesson-preparation-read.adapter.ts',
    );
    const subject = read(
      'src/modules/student-app/subjects/infrastructure/student-subject-lessons-read.adapter.ts',
    );

    for (const appRead of [student, parent, subject]) {
      expect(appRead).toContain(
        'publicationStatus: LessonContentPublicationStatus.PUBLISHED',
      );
    }
    expect(teacher).toContain('LessonContentPublicationStatus.DRAFT');
    expect(teacher).toContain('LessonContentPublicationStatus.PUBLISHED');
  });

  it('registers the safe publication conflict with bounded state-only details', () => {
    const catalog = read('ERROR_CATALOG.md');
    const exceptions = read(
      'src/modules/academics/curriculum/domain/lesson-content.exceptions.ts',
    );

    expect(catalog).toContain('learning.content.publication_conflict');
    expect(exceptions).toContain(
      "code: 'learning.content.publication_conflict'",
    );
    expect(exceptions).toContain(
      'Lesson content publication state conflicts with the requested operation',
    );
    expect(exceptions).toContain(
      'export type LessonContentPublicationConflictDetails',
    );
    expect(exceptions).toContain('from: LessonContentPublicationStatus;');
    expect(exceptions).toContain('to: LessonContentPublicationStatus;');
    expect(exceptions).toContain(
      'constructor(details: LessonContentPublicationConflictDetails)',
    );
    expect(catalog).toContain('details are exactly `{ from, to }`');
    expect(catalog).toMatch(
      /No resource,\s+tenant, actor, content, File, or timestamp values are exposed\./u,
    );
  });
});
