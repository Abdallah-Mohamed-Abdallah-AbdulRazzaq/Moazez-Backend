import { presentStructureTree } from '../presenters/structure.presenter';

describe('presentStructureTree', () => {
  it('returns a nested hierarchy ordered by sortOrder then name', () => {
    const tree = presentStructureTree('year-1', 'term-1', [
      {
        id: 'stage-b',
        schoolId: 'school-1',
        nameAr: 'ثانوي',
        nameEn: 'Secondary',
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        grades: [],
      },
      {
        id: 'stage-a',
        schoolId: 'school-1',
        nameAr: 'ابتدائي',
        nameEn: 'Primary',
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        grades: [
          {
            id: 'grade-b',
            schoolId: 'school-1',
            stageId: 'stage-a',
            nameAr: 'الصف الثاني',
            nameEn: 'Grade 2',
            sortOrder: 2,
            capacity: 25,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            sections: [],
          },
          {
            id: 'grade-a',
            schoolId: 'school-1',
            stageId: 'stage-a',
            nameAr: 'الصف الأول',
            nameEn: 'Grade 1',
            sortOrder: 1,
            capacity: 20,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            sections: [
              {
                id: 'section-b',
                schoolId: 'school-1',
                gradeId: 'grade-a',
                nameAr: 'شعبة ب',
                nameEn: 'Section B',
                sortOrder: 2,
                capacity: 18,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                classrooms: [],
              },
              {
                id: 'section-a',
                schoolId: 'school-1',
                gradeId: 'grade-a',
                nameAr: 'شعبة أ',
                nameEn: 'Section A',
                sortOrder: 1,
                capacity: 18,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                classrooms: [
                  {
                    id: 'classroom-b',
                    schoolId: 'school-1',
                    sectionId: 'section-a',
                    roomId: null,
                    nameAr: 'فصل ب',
                    nameEn: 'Classroom B',
                    sortOrder: 2,
                    capacity: 18,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                  },
                  {
                    id: 'classroom-a',
                    schoolId: 'school-1',
                    sectionId: 'section-a',
                    roomId: null,
                    nameAr: 'فصل أ',
                    nameEn: 'Classroom A',
                    sortOrder: 1,
                    capacity: 18,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(tree.stages.map((stage) => stage.id)).toEqual(['stage-a', 'stage-b']);
    expect(tree.stages[0].grades.map((grade) => grade.id)).toEqual([
      'grade-a',
      'grade-b',
    ]);
    expect(tree.stages[0].grades[0].sections.map((section) => section.id)).toEqual([
      'section-a',
      'section-b',
    ]);
    expect(
      tree.stages[0].grades[0].sections[0].classrooms.map(
        (classroom) => classroom.id,
      ),
    ).toEqual(['classroom-a', 'classroom-b']);
  });
});
