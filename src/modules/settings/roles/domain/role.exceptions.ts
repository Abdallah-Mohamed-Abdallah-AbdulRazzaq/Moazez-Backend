import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain-exception';

export class RoleNameTakenException extends DomainException {
  constructor(name: string) {
    super({
      code: 'iam.role.name_taken',
      message: 'A role with this name already exists in this school',
      httpStatus: HttpStatus.CONFLICT,
      details: { name },
    });
  }
}

export class RoleInUseException extends DomainException {
  constructor(roleId: string, userCount: number) {
    super({
      code: 'iam.role.in_use',
      message: 'Role cannot be deleted because users are assigned to it.',
      httpStatus: HttpStatus.CONFLICT,
      details: { roleId, userCount },
    });
  }
}

export class SystemRoleCannotDeleteException extends DomainException {
  constructor(roleId: string) {
    super({
      code: 'iam.role.system_cannot_delete',
      message: 'System roles cannot be deleted',
      httpStatus: HttpStatus.FORBIDDEN,
      details: { roleId },
    });
  }
}

export class SystemRoleCannotModifyException extends DomainException {
  constructor(roleId: string) {
    super({
      code: 'iam.role.system_cannot_modify',
      message: 'System roles cannot be modified',
      httpStatus: HttpStatus.FORBIDDEN,
      details: { roleId },
    });
  }
}

export class UnknownPermissionException extends DomainException {
  constructor(missingCodes: string[]) {
    super({
      code: 'iam.permission.unknown',
      message: 'Unknown permission code',
      httpStatus: HttpStatus.BAD_REQUEST,
      details: { missingCodes },
    });
  }
}
