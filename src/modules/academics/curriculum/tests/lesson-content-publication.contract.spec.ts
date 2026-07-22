import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
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
