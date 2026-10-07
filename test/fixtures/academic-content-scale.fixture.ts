import { createHash, randomUUID } from 'node:crypto';
import { Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';

export const SCALE_BASE_PUBLICATIONS = 6000;
export const SCALE_TYPES = [
  'GENERAL_RESOURCE',
  'WEEKLY_PLAN',
  'SUBJECT_RESOURCE',
  'ONLINE_SESSION',
  'GUARDIAN_WEEKLY_NOTE',
  'TEACHER_PREPARATION',
] as const;
export const SCALE_AUDIENCES = [
  'STUDENTS_AND_GUARDIANS',
  'STUDENTS',
  'GUARDIANS',
  'INTERNAL_STAFF',
] as const;
export const SCALE_SCOPES = [
  'SCHOOL',
  'STAGE',
  'GRADE',
  'SECTION',
  'CLASSROOM',
] as const;

export class AcademicContentScaleFixture {
  readonly organizationId = randomUUID();
  readonly authorId = randomUUID();
  readonly studentUserIds = [randomUUID(), randomUUID()];
  readonly studentIds = [randomUUID(), randomUUID()];
  readonly enrollmentIds = [randomUUID(), randomUUID()];
  readonly parentUserId = randomUUID();
  readonly guardianId = randomUUID();
  readonly now = new Date(Math.floor(Date.now() / 1000) * 1000);
  readonly schools = [0, 1].map(() => ({
    schoolId: randomUUID(),
    yearId: randomUUID(),
    termId: randomUUID(),
    stageId: randomUUID(),
    gradeId: randomUUID(),
    sectionId: randomUUID(),
    classroomId: randomUUID(),
    otherClassroomId: randomUUID(),
    subjectId: randomUUID(),
    unavailableSubjectId: randomUUID(),
  }));
  get target() {
    return this.schools[0];
  }
  get foreign() {
    return this.schools[1];
  }

  constructor(readonly prisma: PrismaService) {}

  id(kind: string, serial: number, schoolId = this.target.schoolId) {
    const hash = createHash('md5')
      .update(`${schoolId}:${kind}:${serial}`)
      .digest('hex');
    const uuid = `${hash.slice(0, 12)}4${hash.slice(13, 16)}8${hash.slice(17)}`;
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
  }

  context(
    actorKind: 'STUDENT' | 'PARENT',
    child = 0,
  ): AcademicContentCurrentRecipientContext {
    const common = {
      schoolId: this.target.schoolId,
      studentId: this.studentIds[child],
      enrollmentId: this.enrollmentIds[child],
      classroomId: this.target.classroomId,
      academicYearId: this.target.yearId,
      termId: this.target.termId,
    };
    return actorKind === 'STUDENT'
      ? { ...common, actorKind, userId: this.studentUserIds[child] }
      : {
          ...common,
          actorKind,
          userId: this.parentUserId,
          guardianIds: [this.guardianId],
        };
  }

  asActor<T>(actorKind: 'STUDENT' | 'PARENT', work: () => Promise<T>) {
    return runWithRequestContext(createRequestContext(), () => {
      const userId =
        actorKind === 'STUDENT' ? this.studentUserIds[0] : this.parentUserId;
      setActor({ id: userId, userType: actorKind });
      setActiveMembership({
        membershipId: randomUUID(),
        roleId: randomUUID(),
        schoolId: this.target.schoolId,
        organizationId: this.organizationId,
        permissions: [
          'academics.academic_content.view',
          'communication.notifications.view',
        ],
      });
      return work();
    });
  }

  async create() {
    await this.prisma.organization.create({
      data: {
        id: this.organizationId,
        name: 'ACC10E scale fixture',
        slug: `acc10e-${this.organizationId}`,
      },
    });
    await this.prisma.user.createMany({
      data: [
        { id: this.authorId, userType: UserType.SCHOOL_USER },
        ...this.studentUserIds.map((id) => ({
          id,
          userType: UserType.STUDENT,
        })),
        { id: this.parentUserId, userType: UserType.PARENT },
      ].map((user) => ({
        ...user,
        email: `${user.id}@acc10e.example.test`,
        firstName: 'Fixture',
        lastName: 'ACC10E',
      })),
    });
    for (const school of this.schools) {
      const {
        schoolId,
        yearId,
        termId,
        stageId,
        gradeId,
        sectionId,
        classroomId,
        otherClassroomId,
        subjectId,
        unavailableSubjectId,
      } = school;
      await this.prisma.school.create({
        data: {
          id: schoolId,
          organizationId: this.organizationId,
          name: 'Scale',
          slug: `acc10e-${schoolId}`,
        },
      });
      await this.prisma.academicYear.create({
        data: {
          id: yearId,
          schoolId,
          nameAr: 'Year',
          nameEn: 'Year',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
        },
      });
      await this.prisma.term.create({
        data: {
          id: termId,
          schoolId,
          academicYearId: yearId,
          isActive: true,
          nameAr: 'Term',
          nameEn: 'Term',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-12-31'),
        },
      });
      await this.prisma.stage.create({
        data: { id: stageId, schoolId, nameAr: 'Stage', nameEn: 'Stage' },
      });
      await this.prisma.grade.create({
        data: {
          id: gradeId,
          schoolId,
          stageId,
          nameAr: 'Grade',
          nameEn: 'Grade',
        },
      });
      await this.prisma.section.create({
        data: {
          id: sectionId,
          schoolId,
          gradeId,
          nameAr: 'Section',
          nameEn: 'Section',
        },
      });
      await this.prisma.classroom.createMany({
        data: [classroomId, otherClassroomId].map((id) => ({
          id,
          schoolId,
          sectionId,
          nameAr: id,
          nameEn: id,
        })),
      });
      await this.prisma.subject.createMany({
        data: [subjectId, unavailableSubjectId].map((id) => ({
          id,
          schoolId,
          code: id,
          nameAr: id,
          nameEn: id,
        })),
      });
      await this.prisma.subjectAllocation.createMany({
        data: [
          {
            schoolId,
            academicYearId: yearId,
            termId,
            gradeId,
            subjectId,
            weeklyHours: 2,
          },
          {
            schoolId,
            academicYearId: yearId,
            termId,
            gradeId,
            subjectId: unavailableSubjectId,
            weeklyHours: 0,
          },
        ],
      });
      await this.createCorpus(school);
    }
    for (let child = 0; child < 2; child++) {
      await this.prisma.student.create({
        data: {
          id: this.studentIds[child],
          schoolId: this.target.schoolId,
          organizationId: this.organizationId,
          userId: this.studentUserIds[child],
          firstName: 'Child',
          lastName: String(child),
        },
      });
      await this.prisma.enrollment.create({
        data: {
          id: this.enrollmentIds[child],
          schoolId: this.target.schoolId,
          studentId: this.studentIds[child],
          classroomId: this.target.classroomId,
          academicYearId: this.target.yearId,
          termId: this.target.termId,
          enrolledAt: new Date(this.now.getTime() - 86400000),
        },
      });
    }
    await this.prisma.guardian.create({
      data: {
        id: this.guardianId,
        schoolId: this.target.schoolId,
        organizationId: this.organizationId,
        userId: this.parentUserId,
        firstName: 'Parent',
        lastName: 'Scale',
        phone: 'fixture-phone',
        relation: 'PARENT',
      },
    });
    await this.resetRelationships();
    await this.prisma.academicContentAudienceRecipient.createMany({
      data: [
        {
          recipientKind: 'STUDENT' as const,
          recipientUserId: this.studentUserIds[0],
          guardianId: null,
        },
        {
          recipientKind: 'GUARDIAN' as const,
          recipientUserId: this.parentUserId,
          guardianId: this.guardianId,
        },
      ].map((recipient) => ({
        ...recipient,
        schoolId: this.target.schoolId,
        publicationId: this.id('publication', 25),
        revisionId: this.id('revision', 25),
        studentId: this.studentIds[0],
        enrollmentId: this.enrollmentIds[0],
        classroomId: this.target.classroomId,
        identityFingerprint: createHash('sha256')
          .update(recipient.recipientUserId)
          .digest('hex'),
      })),
    });
    await this.prisma.academicContentPublication.update({
      where: { id: this.id('publication', 25) },
      data: { studentRecipientCount: 1, guardianRecipientContextCount: 1 },
    });
    // Statistics are refreshed after both corpora and the live relationships exist.
    await this.prisma
      .$executeRaw`ANALYZE academic_content_publications, academic_content_revisions,
      academic_content_revision_targets, academic_content_revision_tags, academic_contents,
      subject_allocations, student_enrollments, student_guardian_links, students, guardians,
      users, schools, organizations, classrooms, sections, grades, stages`;
  }

  async resetRelationships() {
    await this.prisma.enrollment.updateMany({
      where: { id: { in: this.enrollmentIds } },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
        classroomId: this.target.classroomId,
      },
    });
    await this.prisma.studentGuardian.deleteMany({
      where: { guardianId: this.guardianId },
    });
    await this.prisma.studentGuardian.createMany({
      data: this.studentIds.map((studentId) => ({
        schoolId: this.target.schoolId,
        guardianId: this.guardianId,
        studentId,
      })),
    });
    await this.prisma.guardian.update({
      where: { id: this.guardianId },
      data: { canReceiveNotifications: true, deletedAt: null },
    });
    await this.prisma.subjectAllocation.updateMany({
      where: {
        schoolId: this.target.schoolId,
        subjectId: this.target.subjectId,
      },
      data: { weeklyHours: 2, deletedAt: null },
    });
  }

  private async createCorpus(school: (typeof this.schools)[number]) {
    const uuid = (kind: string, serial = Prisma.sql`i`) =>
      Prisma.sql`overlay(overlay(md5(concat(${school.schoolId}, ':', ${kind}, ':', ${serial})) placing '4' from 13) placing '8' from 17)::uuid`;
    const rows = Prisma.sql`WITH dataset AS (
      SELECT i,
        (ARRAY['GENERAL_RESOURCE','WEEKLY_PLAN','SUBJECT_RESOURCE','ONLINE_SESSION','GUARDIAN_WEEKLY_NOTE','TEACHER_PREPARATION'])[((i-1)%6)+1]::academic_content_type AS type,
        CASE WHEN (i-1)%6=5 THEN 'INTERNAL_STAFF' WHEN (i-1)%6=4 THEN 'GUARDIANS'
          WHEN (i-1)%6=3 THEN (ARRAY['STUDENTS_AND_GUARDIANS','STUDENTS'])[(((i-1)/6)%2)+1]
          WHEN (i-1)%6 IN (1,2) THEN (ARRAY['STUDENTS_AND_GUARDIANS','STUDENTS','GUARDIANS'])[(((i-1)/6)%3)+1]
          ELSE (ARRAY['STUDENTS_AND_GUARDIANS','STUDENTS','GUARDIANS','INTERNAL_STAFF'])[(((i-1)/6)%4)+1] END::academic_content_audience_type AS audience,
        (ARRAY['SCHOOL','STAGE','GRADE','SECTION','CLASSROOM'])[(((i-1)/24)%5)+1]::academic_content_target_scope_type AS scope,
        ((i-1)/120)%3 AS qualification
      FROM generate_series(1, ${SCALE_BASE_PUBLICATIONS}::integer) i
    )`;
    await this.prisma.$executeRaw(Prisma.sql`${rows}
      INSERT INTO academic_contents(id,school_id,academic_year_id,term_id,type,audience,title,description,status,created_by_user_id,updated_at)
      SELECT ${uuid('content')},${school.schoolId}::uuid,${school.yearId}::uuid,${school.termId}::uuid,type,audience,
        concat('Scale ',i),concat('Topic ',i%7),'PUBLISHED',${this.authorId}::uuid,${this.now} FROM dataset`);
    await this.prisma.$executeRaw(Prisma.sql`${rows}
      INSERT INTO academic_content_revisions(id,school_id,academic_content_id,revision_number,snapshot_contract_version,
        academic_year_id,term_id,type,audience,title,description,type_specific_snapshot,source_status,captured_by_user_id)
      SELECT ${uuid('revision')},${school.schoolId}::uuid,${uuid('content')},1,2,${school.yearId}::uuid,${school.termId}::uuid,
        type,audience,concat('Scale ',i),concat('Topic ',i%7),
        CASE type
          WHEN 'GENERAL_RESOURCE' THEN NULL
          WHEN 'WEEKLY_PLAN' THEN jsonb_build_object('type',type,'state',jsonb_build_object('weekStartDate',to_char(date '2026-10-05'+((i/6)%3)*7,'YYYY-MM-DD'),'weekEndDate',to_char(date '2026-10-11'+((i/6)%3)*7,'YYYY-MM-DD')))
          WHEN 'SUBJECT_RESOURCE' THEN jsonb_build_object('type',type,'state',jsonb_build_object('resourceCategory','WORKSHEET'))
          WHEN 'ONLINE_SESSION' THEN jsonb_build_object('type',type,'state',jsonb_build_object('platform',CASE WHEN (i/6)%2=0 THEN 'ZOOM' ELSE 'GOOGLE_MEET' END,'startAt',concat('2026-10-',10+(i/6)%3,'T10:00:00.000Z'),'endAt','2026-10-12T11:00:00.000Z'))
          WHEN 'GUARDIAN_WEEKLY_NOTE' THEN jsonb_build_object('type',type,'state',jsonb_build_object('body','Weekly note','priority','NORMAL','requiresAcknowledgement',false))
          ELSE jsonb_build_object('type',type,'state',jsonb_build_object('topic','Teacher only')) END,
        'DRAFT',${this.authorId}::uuid FROM dataset`);
    await this.prisma.$executeRaw(Prisma.sql`${rows}
      INSERT INTO academic_content_revision_targets(school_id,revision_id,scope_type,stage_id,grade_id,section_id,classroom_id,subject_id,identity_fingerprint)
      SELECT ${school.schoolId}::uuid,${uuid('revision')},scope,
        CASE WHEN scope='STAGE' THEN ${school.stageId}::uuid END,
        CASE WHEN scope='GRADE' THEN ${school.gradeId}::uuid END,
        CASE WHEN scope='SECTION' THEN ${school.sectionId}::uuid END,
        CASE WHEN scope='CLASSROOM' THEN ${school.classroomId}::uuid END,
        CASE qualification WHEN 1 THEN ${school.subjectId}::uuid WHEN 2 THEN ${school.unavailableSubjectId}::uuid END,
        repeat(md5(concat(i)),2) FROM dataset`);
    await this.prisma.$executeRaw(Prisma.sql`${rows}
      INSERT INTO academic_content_revision_tags(school_id,revision_id,display_value,normalized_value,sort_order)
      SELECT ${school.schoolId}::uuid,${uuid('revision')},concat('Group ',i%4),concat('group ',i%4),0 FROM dataset`);
    await this.prisma.$executeRaw(Prisma.sql`${rows}
      INSERT INTO academic_content_publications(id,school_id,academic_content_id,revision_id,client_request_id,request_fingerprint,
        source_content_status,status,publish_at,visible_from,visible_until,published_at,expired_at,cancelled_at,cancellation_reason,created_by_user_id,updated_at)
      SELECT ${uuid('publication')},${school.schoolId}::uuid,${uuid('content')},${uuid('revision')},${uuid('request')},repeat(md5(concat(i)),2),'DRAFT',
        CASE i%17 WHEN 2 THEN 'CANCELLED' WHEN 3 THEN 'SCHEDULED' ELSE 'PUBLISHED' END::academic_content_publication_status,
        ${this.now}::timestamp - interval '3 days',
        CASE WHEN i%17=0 THEN ${this.now}::timestamp+interval '1 day' ELSE ${this.now}::timestamp-interval '2 days'-((i/10)::text||' seconds')::interval END,
        CASE WHEN i%17=1 THEN ${this.now}::timestamp-interval '1 day' END,
        CASE WHEN i%17<>3 THEN ${this.now}::timestamp-interval '3 days' END,NULL,
        CASE WHEN i%17=2 THEN ${this.now} END,
        CASE WHEN i%17=2 THEN 'WITHDRAWN'::"AcademicContentPublicationCancellationReason" END,
        ${this.authorId}::uuid,${this.now} FROM dataset`);
    // Respect the existing one-active-publication invariant before adding successors.
    await this.prisma
      .$executeRaw(Prisma.sql`UPDATE academic_content_publications
      SET status='EXPIRED',expired_at=${this.now},cancelled_at=NULL,cancellation_reason=NULL
      WHERE school_id=${school.schoolId}::uuid AND academic_content_id IN
        (SELECT ${uuid('content')} FROM generate_series(1,${SCALE_BASE_PUBLICATIONS}::integer) i WHERE i%100=25)`);
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO academic_content_revisions
      (id,school_id,academic_content_id,revision_number,snapshot_contract_version,academic_year_id,term_id,type,audience,title,description,type_specific_snapshot,source_status,captured_by_user_id)
      SELECT ${uuid('successor-revision')},r.school_id,r.academic_content_id,2,2,r.academic_year_id,r.term_id,r.type,r.audience,
        concat('Successor ',i),r.description,r.type_specific_snapshot,'DRAFT',r.captured_by_user_id
      FROM generate_series(1,${SCALE_BASE_PUBLICATIONS}::integer) i JOIN academic_content_revisions r ON r.id=${uuid('revision')} WHERE i%100=25`);
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO academic_content_revision_targets
      (school_id,revision_id,scope_type,stage_id,grade_id,section_id,classroom_id,subject_id,identity_fingerprint)
      SELECT t.school_id,${uuid('successor-revision')},t.scope_type,t.stage_id,t.grade_id,t.section_id,t.classroom_id,t.subject_id,t.identity_fingerprint
      FROM generate_series(1,${SCALE_BASE_PUBLICATIONS}::integer) i JOIN academic_content_revision_targets t ON t.revision_id=${uuid('revision')} WHERE i%100=25`);
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO academic_content_revision_tags(school_id,revision_id,display_value,normalized_value,sort_order)
      SELECT t.school_id,${uuid('successor-revision')},t.display_value,t.normalized_value,t.sort_order
      FROM generate_series(1,${SCALE_BASE_PUBLICATIONS}::integer) i JOIN academic_content_revision_tags t ON t.revision_id=${uuid('revision')} WHERE i%100=25`);
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO academic_content_publications
      (id,school_id,academic_content_id,revision_id,client_request_id,request_fingerprint,source_content_status,status,publish_at,visible_from,published_at,created_by_user_id,updated_at,supersedes_publication_id,change_significance)
      SELECT ${uuid('successor-publication')},${school.schoolId}::uuid,${uuid('content')},${uuid('successor-revision')},${uuid('successor-request')},repeat(md5(concat(i)),2),
        'DRAFT','PUBLISHED',${this.now}::timestamp-interval '1 day',${this.now}::timestamp-interval '1 day',${this.now}::timestamp-interval '1 day',
        ${this.authorId}::uuid,${this.now},${uuid('publication')},'SIGNIFICANT'
      FROM generate_series(1,${SCALE_BASE_PUBLICATIONS}::integer) i WHERE i%100=25`);
  }

  async dispose() {
    const schoolIds = this.schools.map((s) => s.schoolId);
    const where = { schoolId: { in: schoolIds } };
    await this.prisma.communicationNotification.deleteMany({ where });
    await this.prisma.academicContentAudienceRecipient.deleteMany({ where });
    await this.prisma.academicContentPublication.deleteMany({
      where: { ...where, supersedesPublicationId: { not: null } },
    });
    await this.prisma.academicContentPublication.deleteMany({ where });
    await this.prisma.academicContentRevisionTag.deleteMany({ where });
    await this.prisma.academicContentRevisionTarget.deleteMany({ where });
    await this.prisma.academicContentRevision.deleteMany({ where });
    await this.prisma.academicContent.deleteMany({ where });
    await this.prisma.subjectAllocation.deleteMany({ where });
    await this.prisma.studentGuardian.deleteMany({ where });
    await this.prisma.guardian.deleteMany({ where });
    await this.prisma.enrollment.deleteMany({ where });
    await this.prisma.student.deleteMany({ where });
    await this.prisma.subject.deleteMany({ where });
    await this.prisma.classroom.deleteMany({ where });
    await this.prisma.section.deleteMany({ where });
    await this.prisma.grade.deleteMany({ where });
    await this.prisma.stage.deleteMany({ where });
    await this.prisma.term.deleteMany({ where });
    await this.prisma.academicYear.deleteMany({ where });
    await this.prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    await this.prisma.user.deleteMany({
      where: {
        id: { in: [this.authorId, ...this.studentUserIds, this.parentUserId] },
      },
    });
    await this.prisma.organization.deleteMany({
      where: { id: this.organizationId },
    });
  }
}
