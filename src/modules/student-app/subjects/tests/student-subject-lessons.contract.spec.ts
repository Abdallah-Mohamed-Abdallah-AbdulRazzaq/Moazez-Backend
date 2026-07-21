/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method -- Reflective route-contract checks intentionally inspect class prototypes. */
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../../../common/decorators/school-management-only.decorator';
import { StudentAppModule } from '../../student-app.module';
import { StudentSubjectLessonsController } from '../controller/student-subject-lessons.controller';
import { StudentSubjectsController } from '../controller/student-subjects.controller';

describe('Student Subject lesson discovery contract', () => {
  const controllers =
    (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StudentAppModule) as
      | Array<new (...args: never[]) => unknown>
      | undefined) ?? [];
  const providers =
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StudentAppModule) as
      | Array<new (...args: never[]) => unknown>
      | undefined) ?? [];

  it('registers the subject-scoped lesson route', () => {
    const controller = controllers.find(
      (candidate) => candidate.name === 'StudentSubjectLessonsController',
    );

    expect(controller).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, controller!)).toBe(
      'student/subjects',
    );
  });

  it('exposes GET :subjectId/lessons controller metadata', () => {
    const controller = controllers.find(
      (candidate) => candidate.name === 'StudentSubjectLessonsController',
    );
    const handler = controller?.prototype.listLessons as
      | ((...args: unknown[]) => unknown)
      | undefined;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler!)).toBe(
      ':subjectId/lessons',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler!)).toBe(
      RequestMethod.GET,
    );
  });

  it('requires both permissions without a management-only actor decorator', () => {
    const handler = StudentSubjectLessonsController.prototype.listLessons;

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler)).toEqual(
      ['academics.subjects.view', 'academics.lesson_plans.view'],
    );
    expect(
      Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, handler),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        SCHOOL_MANAGEMENT_ONLY_METADATA,
        StudentSubjectLessonsController,
      ),
    ).toBeUndefined();
  });

  it('leaves the existing Student Subject routes and permission unchanged', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StudentSubjectsController)).toBe(
      'student/subjects',
    );
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        StudentSubjectsController.prototype.listSubjects,
      ),
    ).toEqual(['academics.subjects.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        StudentSubjectsController.prototype.getSubject,
      ),
    ).toEqual(['academics.subjects.view']);
  });

  it('has a dedicated use case for allocation-only empty discovery pages', () => {
    expect(
      providers.some(
        (provider) => provider.name === 'ListStudentSubjectLessonsUseCase',
      ),
    ).toBe(true);
  });

  it('has a dedicated read adapter for visible-plan-only eligibility', () => {
    expect(
      providers.some(
        (provider) => provider.name === 'StudentSubjectLessonsReadAdapter',
      ),
    ).toBe(true);
  });

  it('provides subject-scoped cursor pagination through the discovery use case', () => {
    const useCase = providers.find(
      (provider) => provider.name === 'ListStudentSubjectLessonsUseCase',
    );

    expect(useCase?.prototype.execute).toBeInstanceOf(Function);
  });
});
