export interface TemplateRenderResult {
  rendered: string;
  variables: string[];
  missingVariables: string[];
  unknownVariables: string[];
}

export interface TemplateRenderOptions {
  allowedVariables: readonly string[];
  data: Record<string, unknown>;
  escapeHtml?: boolean;
}

const TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const SAFE_VARIABLE_PATTERN = /^[A-Za-z0-9_.]+$/;
const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    variables.add(match[1].trim());
  }
  return [...variables].sort();
}

export function renderTemplate(
  template: string,
  options: TemplateRenderOptions,
): TemplateRenderResult {
  const allowed = new Set(options.allowedVariables);
  const variables = new Set<string>();
  const missingVariables = new Set<string>();
  const unknownVariables = new Set<string>();

  const rendered = template.replace(
    TOKEN_PATTERN,
    (_token, rawPath: string) => {
      const path = rawPath.trim();
      variables.add(path);

      if (!isSafeVariablePath(path) || !allowed.has(path)) {
        unknownVariables.add(path);
        return '';
      }

      const value = readPath(options.data, path);
      if (value === undefined || value === null) {
        missingVariables.add(path);
        return '';
      }

      const asText = String(value);
      return options.escapeHtml ? escapeHtml(asText) : asText;
    },
  );

  return {
    rendered,
    variables: [...variables].sort(),
    missingVariables: [...missingVariables].sort(),
    unknownVariables: [...unknownVariables].sort(),
  };
}

export function collectRenderIssues(
  templates: string[],
  allowedVariables: readonly string[],
): { variables: string[]; unknownVariables: string[] } {
  const variables = new Set<string>();
  const unknownVariables = new Set<string>();
  const allowed = new Set(allowedVariables);

  for (const template of templates) {
    for (const variable of extractTemplateVariables(template)) {
      variables.add(variable);
      if (!isSafeVariablePath(variable) || !allowed.has(variable)) {
        unknownVariables.add(variable);
      }
    }
  }

  return {
    variables: [...variables].sort(),
    unknownVariables: [...unknownVariables].sort(),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeVariablePath(path: string): boolean {
  if (!SAFE_VARIABLE_PATTERN.test(path)) return false;
  const segments = path.split('.');
  return segments.every(
    (segment) => segment.length > 0 && !BLOCKED_SEGMENTS.has(segment),
  );
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}
