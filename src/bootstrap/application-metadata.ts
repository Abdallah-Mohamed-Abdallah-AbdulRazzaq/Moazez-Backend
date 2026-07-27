export const APPLICATION_NAME = 'moazez-backend';
export const APPLICATION_VERSION = '0.0.1';
export const GLOBAL_PREFIX = 'api/v1';
export const SWAGGER_PATH = `${GLOBAL_PREFIX}/docs`;

export interface ApplicationIdentity {
  service: typeof APPLICATION_NAME;
  version: typeof APPLICATION_VERSION;
}

export const APPLICATION_IDENTITY: ApplicationIdentity = Object.freeze({
  service: APPLICATION_NAME,
  version: APPLICATION_VERSION,
});
