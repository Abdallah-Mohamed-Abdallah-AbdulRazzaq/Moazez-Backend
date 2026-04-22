import {
  PlacementTestResponseDto,
  PlacementTestsListResponseDto,
} from '../dto/placement-test.dto';
import { PlacementTestRecord } from '../infrastructure/placement-tests.repository';
import { mapPlacementTestStatusToApi } from '../domain/placement-test.enums';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

export function presentPlacementTest(
  placementTest: PlacementTestRecord,
): PlacementTestResponseDto {
  return {
    id: placementTest.id,
    applicationId: placementTest.applicationId,
    studentName: placementTest.application.studentName,
    subjectId: placementTest.subjectId,
    subjectName: placementTest.subject
      ? deriveName(placementTest.subject.nameAr, placementTest.subject.nameEn)
      : null,
    type: placementTest.type,
    scheduledAt: placementTest.scheduledAt?.toISOString() ?? null,
    score:
      placementTest.score !== null
        ? Number(placementTest.score.toString())
        : null,
    result: placementTest.result,
    status: mapPlacementTestStatusToApi(placementTest.status),
    createdAt: placementTest.createdAt.toISOString(),
    updatedAt: placementTest.updatedAt.toISOString(),
  };
}

export function presentPlacementTests(args: {
  items: PlacementTestRecord[];
  page: number;
  limit: number;
  total: number;
}): PlacementTestsListResponseDto {
  return {
    items: args.items.map(presentPlacementTest),
    pagination: {
      page: args.page,
      limit: args.limit,
      total: args.total,
    },
  };
}
