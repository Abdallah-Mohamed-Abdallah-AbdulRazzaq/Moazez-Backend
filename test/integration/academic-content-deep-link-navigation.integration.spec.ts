import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../../src/modules/academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { CommunicationAppNotificationCenterService } from '../../src/modules/communication/application/communication-app-notification-center.service';
import { CommunicationNotificationRepository } from '../../src/modules/communication/infrastructure/communication-notification.repository';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import {
  GetParentAcademicContentUseCase,
  ListParentAcademicContentAccessibleChildrenUseCase,
} from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { GetStudentAcademicContentUseCase } from '../../src/modules/student-app/academic-content/application/student-academic-content.use-cases';
import { AcademicContentScaleFixture } from '../fixtures/academic-content-scale.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
describeDatabase('ACC-10E Communication deep-link recipient navigation', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const fixture = new AcademicContentScaleFixture(prisma);
  const currentAccess = new AcademicContentCurrentAccessService(
    new AcademicContentRecipientReadRepository(prisma),
    new AcademicContentAudienceRepository(prisma),
  );
  const center = new CommunicationAppNotificationCenterService(
    new CommunicationNotificationRepository(prisma),
  );
  const studentDetail = new GetStudentAcademicContentUseCase(
    new StudentAppAccessService(new StudentAppStudentReadAdapter(prisma)),
    currentAccess,
  );
  const parentAccess = new ParentAppAccessService(
    new ParentAppGuardianReadAdapter(prisma),
  );
  const parentDetail = new GetParentAcademicContentUseCase(
    parentAccess,
    currentAccess,
  );
  const accessibleChildren =
    new ListParentAcademicContentAccessibleChildrenUseCase(
      parentAccess,
      currentAccess,
    );
  const contentId = () => fixture.id('content', 25);
  const oldPublicationId = () => fixture.id('publication', 25);
  const successor = () => ({
    publicationId: fixture.id('successor-publication', 25),
    revisionId: fixture.id('successor-revision', 25),
  });

  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-10E navigation requires disposable PostgreSQL',
    });
    await prisma.$connect();
    await fixture.create();
  });
  beforeEach(async () => {
    await fixture.resetRelationships();
  });
  afterAll(async () => {
    try {
      await fixture.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });

  async function notification(
    actor: 'STUDENT' | 'PARENT',
    studentIds: string[],
    academicContentId = contentId(),
  ) {
    const recipientUserId =
      actor === 'STUDENT' ? fixture.studentUserIds[0] : fixture.parentUserId;
    const stored = await prisma.communicationNotification.create({
      data: {
        schoolId: fixture.target.schoolId,
        recipientUserId,
        sourceModule: 'ACADEMICS',
        sourceType: 'academic_content_publication',
        sourceId: oldPublicationId(),
        type: 'ACADEMIC_CONTENT_PUBLISHED',
        title: 'Publication-time notification',
        body: 'Navigate to academic content',
        metadata: {
          academicContentId,
          publicationId: oldPublicationId(),
          studentIds,
        },
      },
    });
    const result = await fixture.asActor(actor, () =>
      center.getForActor({
        recipientUserId,
        notificationId: stored.id,
        aliasStyle: 'camel',
      }),
    );
    const link = result.notification.deepLink;
    if (!link || link.type !== 'academic_content')
      throw new Error('Expected Academic Content deep link');
    expect(link).toEqual({
      type: 'academic_content',
      academicContentId,
      publicationId: oldPublicationId(),
      studentId: studentIds.length === 1 ? studentIds[0] : null,
    });
    return { link, stored, recipientUserId };
  }

  it('navigates from a persisted Student notification to the current successor detail', async () => {
    const { link } = await notification('STUDENT', [fixture.studentIds[0]]);
    const detail = await fixture.asActor('STUDENT', () =>
      studentDetail.execute(link.academicContentId),
    );
    expect(detail.content).toEqual(expect.objectContaining(successor()));
    expect(detail.content.publicationId).not.toBe(link.publicationId);
  });

  it('navigates a single-child Parent link to the current child-scoped successor', async () => {
    const { link } = await notification('PARENT', [fixture.studentIds[0]]);
    if (!link.studentId) throw new Error('Expected child-scoped link');
    const studentId = link.studentId;
    const detail = await fixture.asActor('PARENT', () =>
      parentDetail.execute(studentId, link.academicContentId),
    );
    expect(detail.content).toEqual(expect.objectContaining(successor()));
  });

  it('uses the existing multi-child resolver and current children, including a child without historical recipient membership', async () => {
    const { link } = await notification('PARENT', fixture.studentIds);
    expect(link.studentId).toBeNull();
    const result = await fixture.asActor('PARENT', () =>
      accessibleChildren.execute(link.academicContentId),
    );
    expect(result.publicationId).toBe(successor().publicationId);
    expect(result.children.map((child) => child.studentId).sort()).toEqual(
      [...fixture.studentIds].sort(),
    );
    expect(
      await prisma.academicContentAudienceRecipient.count({
        where: { studentId: fixture.studentIds[1] },
      }),
    ).toBe(0);
    for (const child of result.children) {
      const detail = await fixture.asActor('PARENT', () =>
        parentDetail.execute(child.studentId, link.academicContentId),
      );
      expect(detail.content).toEqual(expect.objectContaining(successor()));
    }
  });

  it('denies former Student enrollment while the notification and historical recipient remain unchanged', async () => {
    const { link, stored } = await notification('STUDENT', [
      fixture.studentIds[0],
    ]);
    const history = await prisma.academicContentAudienceRecipient.findMany({
      where: { schoolId: fixture.target.schoolId },
    });
    await prisma.enrollment.update({
      where: { id: fixture.enrollmentIds[0] },
      data: { status: 'WITHDRAWN' },
    });
    await expect(
      fixture.asActor('STUDENT', () =>
        studentDetail.execute(link.academicContentId),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(
      await prisma.communicationNotification.findUnique({
        where: { id: stored.id },
      }),
    ).toEqual(stored);
    expect(
      await prisma.academicContentAudienceRecipient.findMany({
        where: { schoolId: fixture.target.schoolId },
      }),
    ).toEqual(history);
  });

  it('denies a removed Guardian link and resolves only current children from unchanged multi-child metadata', async () => {
    const { link, stored } = await notification('PARENT', fixture.studentIds);
    await prisma.studentGuardian.deleteMany({
      where: {
        guardianId: fixture.guardianId,
        studentId: fixture.studentIds[0],
      },
    });
    await expect(
      fixture.asActor('PARENT', () =>
        parentDetail.execute(fixture.studentIds[0], link.academicContentId),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
    const result = await fixture.asActor('PARENT', () =>
      accessibleChildren.execute(link.academicContentId),
    );
    expect(result.children).toEqual([{ studentId: fixture.studentIds[1] }]);
    expect(
      await prisma.communicationNotification.findUnique({
        where: { id: stored.id },
      }),
    ).toEqual(stored);
    expect(
      await prisma.academicContentAudienceRecipient.count({
        where: {
          publicationId: oldPublicationId(),
          guardianId: fixture.guardianId,
        },
      }),
    ).toBe(1);
  });

  it.each(['STUDENT', 'PARENT'] as const)(
    'does not disclose foreign-School content from %s notification metadata',
    async (actor) => {
      const { link } = await notification(
        actor,
        [fixture.studentIds[0]],
        fixture.id('content', 25, fixture.foreign.schoolId),
      );
      const navigate = () =>
        actor === 'STUDENT'
          ? studentDetail.execute(link.academicContentId)
          : parentDetail.execute(fixture.studentIds[0], link.academicContentId);
      await expect(fixture.asActor(actor, navigate)).rejects.toMatchObject({
        httpStatus: 404,
      });
    },
  );
});
