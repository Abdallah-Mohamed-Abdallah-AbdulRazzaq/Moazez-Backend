import {
  DashboardTodoPriority,
  DashboardTodoStatus,
  Prisma,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

const dashboardTodoSelect = {
  id: true,
  date: true,
  title: true,
  notes: true,
  status: true,
  priority: true,
  sortOrder: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DashboardTodoSelect;

export type DashboardTodoSnapshot = Prisma.DashboardTodoGetPayload<{
  select: typeof dashboardTodoSelect;
}>;

export interface DashboardTodoListFilters {
  date: Date;
  status?: DashboardTodoStatus;
  limit: number;
}

export interface CreateDashboardTodoRecord {
  date: Date;
  title: string;
  notes: string | null;
  priority: DashboardTodoPriority;
  sortOrder: number;
}

export interface UpdateDashboardTodoRecord {
  date?: Date;
  title?: string;
  notes?: string | null;
  status?: DashboardTodoStatus;
  priority?: DashboardTodoPriority;
  sortOrder?: number;
  completedAt?: Date | null;
}

export interface DashboardTodoCounts {
  total: number;
  pending: number;
  completed: number;
}

@Injectable()
export class DashboardTodosRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listOwnedTodos(
    scope: DashboardScope,
    filters: DashboardTodoListFilters,
  ): Promise<DashboardTodoSnapshot[]> {
    return this.scopedPrisma.dashboardTodo.findMany({
      where: {
        ownerUserId: scope.actorId,
        date: filters.date,
        ...(filters.status ? { status: filters.status } : {}),
      },
      select: dashboardTodoSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: filters.limit,
    });
  }

  async countOwnedTodos(
    scope: DashboardScope,
    date: Date,
  ): Promise<DashboardTodoCounts> {
    const ownerDateWhere = {
      ownerUserId: scope.actorId,
      date,
    };
    const [total, pending, completed] = await Promise.all([
      this.scopedPrisma.dashboardTodo.count({ where: ownerDateWhere }),
      this.scopedPrisma.dashboardTodo.count({
        where: { ...ownerDateWhere, status: DashboardTodoStatus.PENDING },
      }),
      this.scopedPrisma.dashboardTodo.count({
        where: { ...ownerDateWhere, status: DashboardTodoStatus.COMPLETED },
      }),
    ]);

    return { total, pending, completed };
  }

  async createOwnedTodo(
    scope: DashboardScope,
    input: CreateDashboardTodoRecord,
  ): Promise<DashboardTodoSnapshot> {
    return this.scopedPrisma.dashboardTodo.create({
      data: {
        schoolId: scope.schoolId,
        ownerUserId: scope.actorId,
        date: input.date,
        title: input.title,
        notes: input.notes,
        priority: input.priority,
        sortOrder: input.sortOrder,
      },
      select: dashboardTodoSelect,
    });
  }

  async findOwnedTodo(
    scope: DashboardScope,
    todoId: string,
  ): Promise<DashboardTodoSnapshot | null> {
    return this.scopedPrisma.dashboardTodo.findFirst({
      where: {
        id: todoId,
        ownerUserId: scope.actorId,
      },
      select: dashboardTodoSelect,
    });
  }

  async updateOwnedTodo(
    scope: DashboardScope,
    todoId: string,
    data: UpdateDashboardTodoRecord,
  ): Promise<void> {
    await this.scopedPrisma.dashboardTodo.updateMany({
      where: {
        id: todoId,
        ownerUserId: scope.actorId,
        deletedAt: null,
      },
      data,
    });
  }

  async softDeleteOwnedTodo(
    scope: DashboardScope,
    todoId: string,
    deletedAt: Date,
  ): Promise<void> {
    await this.scopedPrisma.dashboardTodo.updateMany({
      where: {
        id: todoId,
        ownerUserId: scope.actorId,
        deletedAt: null,
      },
      data: { deletedAt },
    });
  }
}
