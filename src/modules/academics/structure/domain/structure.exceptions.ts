import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class AcademicYearOverlapException extends DomainException {
  constructor(details: {
    schoolId: string;
    startDate: string;
    endDate: string;
    conflictingYearId?: string;
  }) {
    super({
      code: 'academics.year.overlapping',
      message: 'Academic year dates overlap with an existing year',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class StructureChildExistsException extends DomainException {
  constructor(details: {
    nodeType: 'stage' | 'grade' | 'section';
    nodeId: string;
    childType: 'grade' | 'section' | 'classroom';
    childCount: number;
  }) {
    super({
      code: 'academics.structure.child_exists',
      message: 'Cannot delete a structure node with children',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class TermOutsideAcademicYearException extends DomainException {
  constructor(details: {
    academicYearId: string;
    startDate: string;
    endDate: string;
    yearStartDate: string;
    yearEndDate: string;
  }) {
    super({
      code: 'validation.failed',
      message: 'Term dates must be within the parent academic year',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}
