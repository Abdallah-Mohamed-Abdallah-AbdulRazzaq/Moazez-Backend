import { Prisma, UserType } from '@prisma/client';

export function ownedAllocationWhere(
  teacherUserId: string,
): Prisma.TeacherSubjectAllocationWhereInput {
  return {
    teacherUserId,
    teacherUser: {
      is: {
        userType: UserType.TEACHER,
        deletedAt: null,
      },
    },
    subject: {
      is: {
        deletedAt: null,
      },
    },
    classroom: {
      is: {
        deletedAt: null,
        section: {
          is: {
            deletedAt: null,
            grade: {
              is: {
                deletedAt: null,
                stage: {
                  is: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
    },
    term: {
      is: {
        deletedAt: null,
      },
    },
  };
}
