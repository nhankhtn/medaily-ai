import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettier from "eslint-config-prettier"

/**
 * Type-aware linting, on purpose. Most of what can go wrong here is a promise
 * nobody waited for — a checkpoint write, a Telegram report — and that is
 * invisible to a linter that cannot see types. `recommendedTypeChecked` costs a
 * TypeScript program per run and finds those.
 *
 * Formatting is not ESLint's job: `prettier` last switches off every stylistic
 * rule so the two never disagree about the same line.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "public/**", ".vercel/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // This file is not in `tsconfig.json`, so there is no program to check it against.
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },

  prettier,
)
