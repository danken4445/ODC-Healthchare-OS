import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/** Shared Next.js baseline for every workspace application. */
const config = [
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**"] },
  ...compat.extends("next/core-web-vitals"),
  { settings: { next: { rootDir: ["apps/*/"] } } },
];

export default config;
