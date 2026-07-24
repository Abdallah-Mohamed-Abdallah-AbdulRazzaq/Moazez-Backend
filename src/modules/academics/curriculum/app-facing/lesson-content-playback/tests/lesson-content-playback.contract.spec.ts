import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../../../common/decorators/required-permissions.decorator';
import { ParentChildLessonsController } from '../../../../../parent-app/lessons/controller/parent-child-lessons.controller';
import { TeacherLessonPreparationController } from '../../../../../teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller';

describe('Lesson content playback HTTP contracts', () => {
  const reflector = new Reflector();

  it('declares the exact Parent playback route and permissions', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ParentChildLessonsController.prototype,
      'getPlayback',
    )?.value as ((...args: unknown[]) => unknown) | undefined;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler as object)).toBe(
      ':lessonPlanItemId/content/:contentItemId/playback',
    );
    expect(
      reflector.get<string[]>(REQUIRED_PERMISSIONS_METADATA, handler as object),
    ).toEqual(['academics.lesson_plans.view', 'academics.curriculum.view']);
  });

  it('declares the exact Teacher playback route and permissions', () => {
    const handler = Object.getOwnPropertyDescriptor(
      TeacherLessonPreparationController.prototype,
      'getPlayback',
    )?.value as ((...args: unknown[]) => unknown) | undefined;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler as object)).toBe(
      ':lessonPlanItemId/content/:contentItemId/playback',
    );
    expect(
      reflector.get<string[]>(REQUIRED_PERMISSIONS_METADATA, handler as object),
    ).toEqual([
      'teacher.lesson_preparation.view',
      'academics.lesson_plans.view',
      'academics.curriculum.view',
    ]);
  });

  it('delegates all Parent path identifiers without accepting storage input', async () => {
    const execute = jest.fn().mockResolvedValue({ renewable: true });
    const controller = new ParentChildLessonsController(
      {} as never,
      {} as never,
      {} as never,
      { execute } as never,
    );

    await controller.getPlayback('student-1', 'item-1', 'content-1');

    expect(execute).toHaveBeenCalledWith({
      studentId: 'student-1',
      lessonPlanItemId: 'item-1',
      contentItemId: 'content-1',
    });
  });

  it('delegates only the Teacher item and content identifiers', async () => {
    const execute = jest.fn().mockResolvedValue({ renewable: true });
    const controller = new TeacherLessonPreparationController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { execute } as never,
    );

    await controller.getPlayback('item-1', 'content-1');

    expect(execute).toHaveBeenCalledWith({
      lessonPlanItemId: 'item-1',
      contentItemId: 'content-1',
    });
  });
});
