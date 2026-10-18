import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    // Global ignores
    {
        ignores: [
            '.next/**',
            'node_modules/**',
            'dist/**',
            'build/**',
            'out/**',
            'next-env.d.ts',
            'public/**',
            'coverage/**',
            'scripts/**', // Ignore scripts if not in tsconfig
            'tests/**',    // Ignore tests if not in tsconfig or handle separately
            'submit_manger_api/**',
            'ojs-theme/**', // OJS (PHP/Smarty) theme deployed to SiteGround, not part of the Next app
            'server.js',
            '**/*.cjs',
            'vitest.config.ts',
            'verify-sanitization.js',
            'check-db.js',
            'check-rpc.js',
            'check-users.js',
            'test-parse.js',
        ],
    },
    // Base configuration for JS/TS files
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            '@next/next': nextPlugin,
            '@typescript-eslint': tseslintPlugin,
            'unused-imports': unusedImports,
            'react-hooks': reactHooks,
        },
        languageOptions: {
            parser,
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 'latest',
                project: ['./tsconfig.json'],
            },
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            ...tseslintPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,

            // ✅ Unused imports (warn instead of error)
            'unused-imports/no-unused-imports': 'warn',

            // ✅ Unused variables - more relaxed configuration
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],

            // Disable the default ESLint rule to avoid duplication
            'no-unused-vars': 'off',

            // ✅ TypeScript unused vars - WARN instead of ERROR
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                    caughtErrors: 'none',
                },
            ],

            // ✅ Disallow `any` - WARN instead of ERROR for flexibility
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',

            // ✅ Next.js specific tweaks
            '@next/next/no-html-link-for-pages': 'off',
            '@next/next/no-assign-module-variable': 'error', // Keep it but ignore artifacts via glob
        },
    },
    // UIET-P1: ban admin-session helpers from public-facing surfaces.
    // The new public-user identity layer (getIdentity from src/lib/identity-cookie)
    // is sibling to the admin session and must never be confused with it.
    {
        files: [
            'app/**/*.{ts,tsx}',
            'src/server/routes/**/*.ts',
        ],
        ignores: [
            'app/admin/**',
            'app/api/[[...route]]/**',
        ],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@/src/lib/db/auth',
                            importNames: ['getSession', 'createSession', 'destroySession'],
                            message:
                                'UIET-P1: public routes must use getIdentity from @/src/lib/identity-cookie, not the admin session helpers.',
                        },
                        {
                            name: '@/src/lib/db/auth-edge',
                            importNames: ['getSession'],
                            message:
                                'UIET-P1: public routes must use getIdentity from @/src/lib/identity-cookie, not the admin session helpers.',
                        },
                        {
                            name: 'jose',
                            importNames: ['jwtVerify'],
                            message:
                                'UIET-P1: public routes must use verifyCookie from @/src/lib/identity-cookie. jose.jwtVerify is reserved for the admin auth path.',
                        },
                    ],
                },
            ],
        },
    },
];
