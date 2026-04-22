import { Injectable } from '@nestjs/common';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UsersListResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUsersList } from '../presenters/users.presenter';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    const result = await this.usersRepository.listUsers({
      search: query.search,
      roleId: query.roleId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    return presentUsersList({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  }
}
