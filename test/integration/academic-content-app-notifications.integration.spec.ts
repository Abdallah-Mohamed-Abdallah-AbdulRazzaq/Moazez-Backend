import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  UserType,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { CommunicationAppNotificationCenterService } from '../../src/modules/communication/application/communication-app-notification-center.service';
import { COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES } from '../../src/modules/communication/domain/communication-notification-domain';
import * as queryEnums from '../../src/modules/communication/dto/communication-notification.dto';
import { CommunicationNotificationRepository } from '../../src/modules/communication/infrastructure/communication-notification.repository';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { StudentNotificationsController } from '../../src/modules/student-app/notifications/controller/student-notifications.controller';
import { ParentNotificationsController } from '../../src/modules/parent-app/notifications/controller/parent-notifications.controller';
import * as studentUseCases from '../../src/modules/student-app/notifications/application/student-notifications.use-cases';
import * as parentUseCases from '../../src/modules/parent-app/notifications/application/parent-notifications.use-cases';

jest.setTimeout(45_000);

describe('ACC-8E existing app notification HTTP contracts with PostgreSQL', () => {
  const prisma = new PrismaService();
  let app: INestApplication<App>;
  let organizationId: string;
  let schoolId: string;
  let otherSchoolId: string;
  const studentUserId = randomUUID();
  const parentUserId = randomUUID();
  const otherUserId = randomUUID();
  const contentId = randomUUID();
  const publicationId = randomUUID();
  const studentIds = [randomUUID(), randomUUID()];
  const marker = 'acc8e-private-metadata';
  const hostileMetadata = Object.fromEntries(
    [
      'joinUrl',
      'accessCode',
      'providerName',
      'instructions',
      'bucket',
      'objectKey',
      'fileUrl',
      'phone',
      'email',
      'nationalId',
      'deviceToken',
      'guardianId',
      'enrollmentId',
    ].map((key) => [key, marker]),
  );
  const ids = new Map<string, string>();
  const notificationKeys = [
    'notificationId',
    'notification_id',
    'type',
    'sourceModule',
    'source_module',
    'sourceId',
    'source_id',
    'title',
    'body',
    'priority',
    'status',
    'readAt',
    'read_at',
    'archivedAt',
    'archived_at',
    'createdAt',
    'created_at',
    'deepLink',
    'deep_link',
  ].sort();

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: 'ACC-8E app fixture', slug: `acc8e-${suffix}` },
    });
    organizationId = organization.id;
    const schools = await Promise.all(
      ['own', 'foreign'].map((name) =>
        prisma.school.create({
          data: {
            organizationId,
            name: `ACC-8E ${name}`,
            slug: `acc8e-${name}-${suffix}`,
          },
        }),
      ),
    );
    [schoolId, otherSchoolId] = schools.map((school) => school.id);
    await prisma.user.createMany({
      data: [
        { id: studentUserId, userType: UserType.STUDENT },
        { id: parentUserId, userType: UserType.PARENT },
        { id: otherUserId, userType: UserType.STUDENT },
      ].map((user) => ({
        ...user,
        firstName: 'ACC-8E',
        lastName: 'Fixture',
        email: `${user.id}@acc8e.example.test`,
        passwordHash: 'unused-test-hash',
      })),
    });
    for (const [surface, recipientUserId] of [
      ['student', studentUserId],
      ['parent', parentUserId],
    ] as const) {
      for (const type of COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES) {
        const notification = await prisma.communicationNotification.create({
          data: {
            schoolId,
            recipientUserId,
            sourceModule: CommunicationNotificationSourceModule.ACADEMICS,
            sourceType: 'academic_content_publication',
            sourceId: publicationId,
            type,
            title: 'Academic Content',
            body: 'Safe public title',
            priority: CommunicationNotificationPriority.NORMAL,
            status: CommunicationNotificationStatus.UNREAD,
            metadata: {
              ...hostileMetadata,
              academicContentId: contentId,
              publicationId,
              studentIds: surface === 'student' ? [studentIds[0]] : studentIds,
            },
          },
        });
        ids.set(`${surface}:${type}`, notification.id);
      }
    }
    for (const [key, fixtureSchool, recipientUserId] of [
      ['other-recipient', schoolId, otherUserId],
      ['foreign-student', otherSchoolId, studentUserId],
      ['foreign-parent', otherSchoolId, parentUserId],
    ] as const) {
      const row = await prisma.communicationNotification.create({
        data: {
          schoolId: fixtureSchool,
          recipientUserId,
          sourceModule: CommunicationNotificationSourceModule.ACADEMICS,
          sourceType: 'academic_content_publication',
          sourceId: publicationId,
          type: COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES[0],
          title: 'Hidden foreign notification',
          body: 'Hidden foreign body',
          metadata: { academicContentId: contentId },
        },
      });
      ids.set(key, row.id);
    }
    // Authentication/enrollment resolution is supplied at the app boundary.
    // Controllers, app use cases, Communication service, presenter and scoped
    // PostgreSQL repository below are the production implementations.
    const moduleRef = await Test.createTestingModule({
      controllers: [
        StudentNotificationsController,
        ParentNotificationsController,
      ],
      providers: [
        ...Object.values(studentUseCases),
        ...Object.values(parentUseCases),
        CommunicationAppNotificationCenterService,
        CommunicationNotificationRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        {
          provide: StudentAppAccessService,
          useValue: {
            getCurrentStudentWithEnrollment: () =>
              Promise.resolve({
                context: { schoolId, studentUserId },
              }),
          },
        },
        {
          provide: ParentAppAccessService,
          useValue: {
            assertCurrentParent: () =>
              Promise.resolve({ schoolId, parentUserId }),
          },
        },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.setGlobalPrefix('api/v1');
    app.use((req: { url: string }, _res: unknown, next: () => void) => {
      const context = createRequestContext();
      const parent = req.url.startsWith('/api/v1/parent/');
      context.actor = {
        id: parent ? parentUserId : studentUserId,
        userType: parent ? UserType.PARENT : UserType.STUDENT,
      };
      context.activeMembership = {
        membershipId: randomUUID(),
        schoolId,
        organizationId,
        roleId: randomUUID(),
        permissions: [
          'communication.notifications.view',
          'communication.notifications.read',
          'communication.notifications.archive',
        ],
      };
      runWithRequestContext(context, next);
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (schoolId && otherSchoolId) {
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: [schoolId, otherSchoolId] } },
      });
      await prisma.school.deleteMany({ where: { organizationId } });
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [studentUserId, parentUserId, otherUserId] } },
    });
    await prisma.$disconnect();
  });

  describe.each(['student', 'parent'] as const)(
    '%s existing Notification Center',
    (surface) => {
      const base = `/api/v1/${surface}/notifications`;
      it.each(COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES)(
        'filters and safely presents %s through the real scoped repository',
        async (type) => {
          const response = await request(app.getHttpServer())
            .get(base)
            .query({
              category: 'academic_content',
              sourceModule: 'academics',
              type: type.toLowerCase(),
              groupBy: 'category',
            })
            .expect(200);
          const result = response.body as {
            notifications: Record<string, unknown>[];
            groups: object[];
          };
          expect(result.notifications).toHaveLength(1);
          const notification = result.notifications[0];
          expect(Object.keys(notification).sort()).toEqual(notificationKeys);
          expect(notification).toMatchObject({
            notificationId: ids.get(`${surface}:${type}`),
            type: type.toLowerCase(),
            sourceModule: 'academics',
            source_module: 'academics',
            deepLink: {
              type: 'academic_content',
              academicContentId: contentId,
              publicationId,
              studentId: surface === 'student' ? studentIds[0] : null,
            },
          });
          expect(notification.deep_link).toEqual(notification.deepLink);
          expect(result.groups).toEqual([
            {
              key: 'academic_content',
              label: 'Academic Content',
              count: 1,
              unreadCount: 1,
              unread_count: 1,
            },
          ]);
          expect(JSON.stringify(response.body)).not.toContain(marker);
          expect(notification).not.toHaveProperty('metadata');
        },
      );

      it('accepts all category events and rejects inconsistent or unowned filters', async () => {
        const response = await request(app.getHttpServer())
          .get(base)
          .query({ category: 'academic_content', sourceModule: 'academics' })
          .expect(200);
        expect(
          (response.body as { notifications: object[] }).notifications,
        ).toHaveLength(4);
        await request(app.getHttpServer())
          .get(base)
          .query({ category: 'academic_content', type: 'message_received' })
          .expect(422);
        for (const query of [
          { type: 'invalid' },
          { category: 'invalid' },
          { recipientUserId: otherUserId },
        ])
          await request(app.getHttpServer()).get(base).query(query).expect(400);
      });

      it('hides other recipients and Schools for detail, read and archive', async () => {
        for (const id of [
          ids.get('other-recipient')!,
          ids.get(`foreign-${surface}`)!,
          randomUUID(),
        ]) {
          const detail = await request(app.getHttpServer())
            .get(`${base}/${id}`)
            .expect(404);
          expect(detail.body).toEqual({
            error: {
              code: 'not_found',
              message: 'Notification not found',
              details: { notificationId: id },
              traceId: expect.any(String) as unknown,
            },
          });
          expect(JSON.stringify(detail.body)).not.toMatch(
            new RegExp(`${schoolId}|${otherSchoolId}|${otherUserId}|${marker}`),
          );
          for (const action of ['read', 'archive'])
            await request(app.getHttpServer())
              .post(`${base}/${id}/${action}`)
              .send({})
              .expect(404);
        }
      });

      it('uses actor-owned writes and safe detail navigation for a single child', async () => {
        const id = ids.get(
          `${surface}:${COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES[0]}`,
        )!;
        await prisma.communicationNotification.update({
          where: { id },
          data: {
            metadata: {
              ...hostileMetadata,
              academicContentId: contentId,
              publicationId,
              studentIds: [studentIds[0]],
            },
          },
        });
        const detail = await request(app.getHttpServer())
          .get(`${base}/${id}`)
          .expect(200);
        expect(
          (detail.body as { notification: { deepLink: object } }).notification
            .deepLink,
        ).toEqual({
          type: 'academic_content',
          academicContentId: contentId,
          publicationId,
          studentId: studentIds[0],
        });
        for (const action of ['read', 'archive']) {
          const response = await request(app.getHttpServer())
            .post(`${base}/${id}/${action}`)
            .send({ recipientUserId: otherUserId, schoolId: otherSchoolId })
            .expect(201);
          expect(JSON.stringify(response.body)).not.toContain(marker);
          const saved =
            await prisma.communicationNotification.findUniqueOrThrow({
              where: { id },
            });
          expect(saved.recipientUserId).toBe(
            surface === 'student' ? studentUserId : parentUserId,
          );
          expect(saved.schoolId).toBe(schoolId);
          expect(saved.status).toBe(action === 'read' ? 'READ' : 'ARCHIVED');
          const foreign =
            await prisma.communicationNotification.findUniqueOrThrow({
              where: { id: ids.get('other-recipient')! },
            });
          expect(foreign.status).toBe('UNREAD');
        }
      });

      it('fails closed on contradictory publication and malformed navigation identities', async () => {
        const id = ids.get(
          `${surface}:${COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES[1]}`,
        )!;
        for (const patch of [
          {
            metadata: {
              academicContentId: contentId,
              publicationId: randomUUID(),
            },
          },
          { metadata: { academicContentId: 'invalid', publicationId } },
          { sourceId: null, metadata: { academicContentId: contentId } },
          {
            sourceId: publicationId,
            sourceType: 'wrong',
            metadata: { academicContentId: contentId },
          },
          {
            sourceType: 'academic_content_publication',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
          },
        ]) {
          await prisma.communicationNotification.update({
            where: { id },
            data: patch,
          });
          const response = await request(app.getHttpServer())
            .get(`${base}/${id}`)
            .expect(200);
          expect(
            (
              response.body as {
                notification: { deepLink: unknown; deep_link: unknown };
              }
            ).notification,
          ).toMatchObject({ deepLink: null, deep_link: null });
        }
      });

      it('publishes exact existing routes, explicit queries, aliases and deep-link Swagger', () => {
        const document = SwaggerModule.createDocument(
          app,
          new DocumentBuilder().build(),
        );
        const prefix = surface === 'student' ? 'Student' : 'Parent';
        const schemas = document.components!.schemas!;
        const schema = (name: string) => {
          const value = schemas[prefix + name];
          if (!value || '$ref' in value) throw new Error('missing_app_schema');
          return value;
        };
        const routes = Object.entries(document.paths)
          .filter(([path]) => path.startsWith(base))
          .flatMap(([path, methods]) =>
            Object.keys(methods).map(
              (method) => `${method.toUpperCase()} ${path}`,
            ),
          )
          .sort();
        expect(routes).toEqual(
          [
            `GET ${base}`,
            `GET ${base}/summary`,
            `POST ${base}/read-all`,
            `GET ${base}/preferences`,
            `PATCH ${base}/preferences`,
            `POST ${base}/device-tokens`,
            `DELETE ${base}/device-tokens/current`,
            `GET ${base}/{notificationId}`,
            `POST ${base}/{notificationId}/read`,
            `POST ${base}/{notificationId}/archive`,
          ].sort(),
        );
        const parameters = document.paths[base].get!.parameters!;
        for (const [name, values] of Object.entries({
          status: queryEnums.COMMUNICATION_NOTIFICATION_STATUSES,
          priority: queryEnums.COMMUNICATION_NOTIFICATION_PRIORITIES,
          type: queryEnums.COMMUNICATION_NOTIFICATION_TYPES,
          sourceModule: queryEnums.COMMUNICATION_NOTIFICATION_SOURCE_MODULES,
          unreadOnly: queryEnums.COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES,
          category: queryEnums.COMMUNICATION_APP_NOTIFICATION_CATEGORIES,
          groupBy: queryEnums.COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES,
        }))
          expect(
            parameters.find(
              (parameter) => 'name' in parameter && parameter.name === name,
            ),
          ).toMatchObject({
            in: 'query',
            required: false,
            schema: { enum: values },
          });
        expect(
          Object.keys(schema('NotificationDto').properties!).sort(),
        ).toEqual(notificationKeys);
        expect(
          Object.keys(schema('NotificationDeepLinkDto').properties!).sort(),
        ).toEqual([
          'academicContentId',
          'announcementId',
          'conversationId',
          'messageId',
          'publicationId',
          'studentId',
          'type',
        ]);
        expect(schema('NotificationDeepLinkDto').required).toEqual(['type']);
        for (const field of ['academicContentId', 'publicationId'])
          expect(
            schema('NotificationDeepLinkDto').properties![field],
          ).toMatchObject({ type: 'string', format: 'uuid' });
        expect(schema('NotificationDeepLinkDto').properties!.studentId).toEqual(
          { type: 'string', format: 'uuid', nullable: true },
        );
        for (const [name, keys] of Object.entries({
          NotificationsListResponseDto: [
            'notifications',
            'pagination',
            'summary',
            'groups',
          ],
          NotificationsPaginationDto: ['page', 'limit', 'total'],
          NotificationsSummaryDto: ['unreadCount', 'unread_count'],
          NotificationGroupDto: [
            'key',
            'label',
            'count',
            'unreadCount',
            'unread_count',
          ],
          NotificationResponseDto: ['notification'],
          NotificationsReadAllResponseDto: [
            'markedCount',
            'marked_count',
            'readAt',
            'read_at',
          ],
          NotificationPreferencesResponseDto: ['preferences'],
          NotificationPreferenceDto: [
            'category',
            'label',
            'description',
            'inAppEnabled',
            'in_app_enabled',
            'pushEnabled',
            'push_enabled',
            'canChange',
            'can_change',
          ],
        }))
          expect(Object.keys(schema(name).properties!).sort()).toEqual(
            keys.sort(),
          );
        expect(getRequestContext()).toBeUndefined();
      });
    },
  );
});
