import { registerDecorator, type ValidationOptions } from 'class-validator';
import { normalizeResponseConfig } from './response-config';

/** Presence and strict object grammar, also revalidated by each owning domain. */
export function IsResponseConfig(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isResponseConfig',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: {
        validate(value: unknown) {
          try {
            normalizeResponseConfig(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage() {
          return 'responseConfig must be a closed response configuration';
        },
      },
    });
}
