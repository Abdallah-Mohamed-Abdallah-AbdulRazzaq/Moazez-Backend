/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment -- route metadata intentionally inspects detached controller methods and Nest argument metadata. */
import { HttpStatus, ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../../../common/decorators/school-management-only.decorator';
import { CurriculumController } from '../controller/curriculum.controller';
import { CurriculumModule } from '../curriculum.module';

type RouteArgumentMetadata = {
  index: number;
  data: string;
  pipes: unknown[];
};

describe('Lesson content publication controller contract', () => {
  const transitions = [
    {
      handler: CurriculumController.prototype.publishLessonContent,
      name: 'publishLessonContent',
      action: 'publish',
    },
    {
      handler: CurriculumController.prototype.unpublishLessonContent,
      name: 'unpublishLessonContent',
      action: 'unpublish',
    },
    {
      handler: CurriculumController.prototype.archiveLessonContentItem,
      name: 'archiveLessonContentItem',
      action: 'archive',
    },
  ] as const;

  it.each(transitions)(
    'registers bodyless POST 200 $action with the existing permission',
    ({ handler, action }) => {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        `:curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/${action}`,
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.OK,
      );
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
      ).toEqual(['academics.curriculum.manage']);
    },
  );

  it.each(transitions)(
    'parses all four $action identifiers as UUIDs and accepts no body argument',
    ({ name }) => {
      const metadata =
        (Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          CurriculumController,
          name,
        ) as Record<string, RouteArgumentMetadata> | undefined) ?? {};
      const parameters = Object.values(metadata);

      expect(parameters).toHaveLength(4);
      expect(parameters.map((parameter) => parameter.data).sort()).toEqual([
        'contentItemId',
        'curriculumId',
        'lessonId',
        'unitId',
      ]);
      for (const parameter of parameters) {
        expect(
          parameter.pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
        ).toBe(true);
      }
    },
  );

  it('inherits the School management actor boundary from CurriculumController', () => {
    expect(
      Reflect.getMetadata(
        SCHOOL_MANAGEMENT_ONLY_METADATA,
        CurriculumController,
      ),
    ).toBe(true);
    for (const { handler } of transitions) {
      expect(
        Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, handler),
      ).toBeUndefined();
    }
  });

  it('registers but does not export the three transition use cases', () => {
    const providers =
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CurriculumModule) as
        | Array<{ name?: string }>
        | undefined) ?? [];
    const exports =
      (Reflect.getMetadata(MODULE_METADATA.EXPORTS, CurriculumModule) as
        | Array<{ name?: string }>
        | undefined) ?? [];
    const names = [
      'PublishLessonContentUseCase',
      'UnpublishLessonContentUseCase',
      'ArchiveLessonContentUseCase',
    ];

    expect(providers.map((provider) => provider.name)).toEqual(
      expect.arrayContaining(names),
    );
    expect(exports.map((provider) => provider.name)).not.toEqual(
      expect.arrayContaining(names),
    );
  });

  it('leaves the six existing content route paths and methods unchanged', () => {
    const routes = [
      CurriculumController.prototype.listLessonContent,
      CurriculumController.prototype.createLessonContent,
      CurriculumController.prototype.getLessonContent,
      CurriculumController.prototype.updateLessonContent,
      CurriculumController.prototype.reorderLessonContent,
      CurriculumController.prototype.deleteLessonContent,
    ].map((handler) => ({
      path: Reflect.getMetadata(PATH_METADATA, handler),
      method: Reflect.getMetadata(METHOD_METADATA, handler),
    }));

    expect(routes).toEqual([
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content',
        method: RequestMethod.GET,
      },
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content',
        method: RequestMethod.POST,
      },
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
        method: RequestMethod.GET,
      },
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
        method: RequestMethod.PATCH,
      },
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId/reorder',
        method: RequestMethod.PATCH,
      },
      {
        path: ':curriculumId/units/:unitId/lessons/:lessonId/content/:contentItemId',
        method: RequestMethod.DELETE,
      },
    ]);
  });
});
