import {
  normalizeOrderingDefinition,
  normalizeNumericDefinition,
  normalizeMathDefinition,
  normalizeNumericKey,
  QuestionEvaluationInputError,
} from './index';
import { parseExpression } from './expression-parser';
const ordering = {
  definitionVersion: 1,
  kind: 'ordering',
  items: [{ id: 'a', displayOrder: 1, label: 'A' }],
};
const numeric = {
  definitionVersion: 1,
  kind: 'numeric',
  units: { required: false, allowedCodes: [], allowUnitless: true },
};
describe('ST10-A hostile object boundaries', () => {
  it('never invokes getters, toJSON, coercion or proxy traps', () => {
    const executed = jest.fn(() => {
      throw new Error('Untrusted behavior executed');
    });
    const getter = Object.defineProperty({}, 'definitionVersion', {
      enumerable: true,
      get: executed,
    });
    const proxy = new Proxy(ordering, {
      ownKeys: executed,
      get: executed,
      getPrototypeOf: executed,
      getOwnPropertyDescriptor: executed,
    });
    const arrayProxy = new Proxy([], {
      ownKeys: executed,
      get: executed,
      getPrototypeOf: executed,
    });
    for (const value of [
      getter,
      proxy,
      { ...ordering, toJSON: executed },
      Object.assign(Object.create({ inherited: true }), ordering),
      { ...ordering, [Symbol('key')]: 'value' },
      { ...ordering, items: arrayProxy },
    ])
      expect(() => normalizeOrderingDefinition(value, 'complete')).toThrow(
        QuestionEvaluationInputError,
      );
    expect(() =>
      normalizeNumericKey(numeric, {
        keyVersion: 1,
        kind: 'numeric',
        reference: { value: { toString: executed }, unitCode: null },
      }),
    ).toThrow();
    expect(executed).not.toHaveBeenCalled();
    expect(() => parseExpression('1', arrayProxy)).toThrow();
    expect(executed).not.toHaveBeenCalled();
  });
  it('rejects nested accessors, sparse arrays, extra fields and undeclared versions', () => {
    const executed = jest.fn();
    const item = Object.defineProperty({ id: 'a', displayOrder: 1 }, 'label', {
      enumerable: true,
      get: executed,
    });
    const sparse = new Array(1);
    const decorated = Object.assign(['x'], { extra: 'bad' });
    expect(() =>
      normalizeOrderingDefinition({ ...ordering, items: [item] }, 'complete'),
    ).toThrow();
    expect(() =>
      normalizeOrderingDefinition({ ...ordering, items: sparse }, 'complete'),
    ).toThrow();
    expect(() =>
      normalizeMathDefinition(
        { definitionVersion: 1, kind: 'math_expression', variables: decorated },
        'complete',
      ),
    ).toThrow();
    expect(() =>
      normalizeNumericDefinition({ ...numeric, keyVersion: 1 }, 'complete'),
    ).toThrow();
    expect(() =>
      normalizeOrderingDefinition(
        { ...ordering, definitionVersion: '1' },
        'complete',
      ),
    ).toThrow();
    expect(executed).not.toHaveBeenCalled();
  });
  it('returns only a fixed diagnostic without reflecting private or attacker content', () => {
    try {
      normalizeOrderingDefinition({ secret: 'PRIVATE_SENTINEL' }, 'complete');
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'question_evaluation.invalid',
        message: 'Invalid question evaluation contract',
      });
      expect(String(error)).not.toContain('PRIVATE_SENTINEL');
    }
  });
});
