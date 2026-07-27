import {
  APPLICATION_IDENTITY,
  APPLICATION_NAME,
  APPLICATION_VERSION,
  GLOBAL_PREFIX,
  SWAGGER_PATH,
} from './application-metadata';

describe('application metadata', () => {
  it('keeps the public identity and bootstrap paths on one canonical contract', () => {
    expect(APPLICATION_IDENTITY).toEqual({
      service: APPLICATION_NAME,
      version: APPLICATION_VERSION,
    });
    expect(APPLICATION_NAME).toBe('moazez-backend');
    expect(APPLICATION_VERSION).toBe('0.0.1');
    expect(GLOBAL_PREFIX).toBe('api/v1');
    expect(SWAGGER_PATH).toBe(`${GLOBAL_PREFIX}/docs`);
  });
});
