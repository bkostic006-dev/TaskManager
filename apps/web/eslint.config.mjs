import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next 15 is still eslintrc-shaped, so FlatCompat is the supported
// way to load it into ESLint 9's flat config. Without it `next lint` and
// `next build` both warn that the Next plugin is missing.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
