/**
 * Guards the "pure core" rule of the Desk engine: the nine modules below decide
 * tickets, clocks and access from their arguments alone. One stray import of the
 * database client or one Date.now() would make every vector table time- or
 * network-dependent, so the rule is enforced here and not only in review.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PURE_MODULES = [
    'ack', 'authz-rules', 'business-hours', 'clock', 'decide', 'internal-contacts', 'phone', 'rules', 'send-number', 'stats',
] as const;
const ALLOWED_IMPORTS = new Set<string>(['./constants', './types', ...PURE_MODULES.map((name) => `./${name}`)]);
const FORBIDDEN: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
    ['database client', /supabase/i],
    ['framework import', /next\//],
    ['network call', /fetch\(|axios/],
    ['environment read', /process\.env/],
    ['hidden clock', /Date\.now\(|new Date\(\)/],
    ['process time zone', /getHours\(|getMinutes\(|getDate\(|getDay\(|getMonth\(|getFullYear\(|setHours\(|toLocale|Intl\.|date-fns|dateUtils/],
    ['default export', /export default/],
    ['any', /: any\b|as any\b|<any>/],
];
const read = (name: string): string =>
    readFileSync(path.resolve(__dirname, '../../src/lib/desk', `${name}.ts`), 'utf8');

describe.each(PURE_MODULES)('pure module %s', (name) => {
    const source = read(name);

    it.each(FORBIDDEN)('has no %s', (_label, pattern) => {
        expect(source).not.toMatch(pattern);
    });

    it('imports only constants, types and other pure modules', () => {
        const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm)]
            .map((match) => match[1] ?? match[2] ?? match[3]);
        expect(specifiers.filter((specifier) => !ALLOWED_IMPORTS.has(specifier))).toEqual([]);
    });
});

describe('ack matching', () => {
    it('never matches by prefix', () => {
        expect(read('ack')).not.toMatch(/startsWith|indexOf|\.search\(/);
    });
});
