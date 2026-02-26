import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    pluginJs.configs.recommended,
    {
        languageOptions : { globals : globals.browser },
        rules           : {
            'accessor-pairs'        : 'off',
            'array-bracket-spacing' : ['warn', 'never'],
            'array-callback-return' : 'off',
            'brace-style'           : [
                'warn',
                'stroustrup',
                {
                    allowSingleLine : false
                }
            ],
            'comma-dangle'              : ['error', 'never'],
            'computed-property-spacing' : ['warn', 'never'],
            'dot-notation'              : 'off',
            eqeqeq                      : ['error', 'always', { null : 'ignore' }],
            indent                      : [
                'error',
                4,
                {
                    SwitchCase   : 1,
                    ignoredNodes : ['TemplateLiteral']
                }
            ],
            'key-spacing' : [
                'warn',
                {
                    multiLine : {
                        afterColon  : true,
                        align       : 'colon',
                        beforeColon : true
                    },
                    singleLine : {
                        afterColon  : true,
                        beforeColon : true
                    }
                }
            ],
            'linebreak-style'   : ['error', 'unix'],
            'multiline-ternary' : 'off',
            'new-cap'           : [
                'warn',
                {
                    capIsNew   : false,
                    newIsCap   : false,
                    properties : false
                }
            ],
            'no-duplicate-imports'         : 'error',
            'no-extra-boolean-cast'        : 'off',
            'no-inner-declarations'        : 'off',
            'no-mixed-operators'           : 'off',
            'no-multi-spaces'              : 'off',
            'no-new-func'                  : 'off',
            'no-new-wrappers'              : 'off',
            'no-prototype-builtins'        : 'off',
            'no-restricted-globals'        : ['error', 'event', 'describe'],
            'no-return-assign'             : 'off',
            'no-trailing-spaces'           : 'warn',
            'no-unmodified-loop-condition' : 'off',
            'no-unused-expressions'        : 'off',
            'no-use-before-define'         : 'off',
            'object-curly-spacing'         : ['warn', 'always'],
            'one-var'                      : 'off',
            'padded-blocks'                : 'off',
            'prefer-const'                 : 'warn',
            'prefer-promise-reject-errors' : 'off',
            'prefer-regex-literals'        : 'off',
            quotes                         : [
                'warn',
                'single',
                {
                    allowTemplateLiterals : true,
                    avoidEscape           : true
                }
            ],
            semi                          : ['error', 'always'],
            'space-before-function-paren' : ['warn', 'never'],
            'spaced-comment'              : 'off',
            'template-curly-spacing'      : 'off',
            yoda                          : [
                'error',
                'never',
                {
                    onlyEquality : true
                }
            ]
        }
    },
    {
        files           : ['**/*.ts'],
        languageOptions : {
            parser        : tsParser,
            parserOptions : {
                ecmaVersion : 'latest',
                sourceType  : 'module'
            }
        },
        plugins : {
            '@typescript-eslint' : tseslint
        },
        rules : {
            ...tseslint.configs.recommended.rules,
            // Allow unused vars prefixed with _
            '@typescript-eslint/no-unused-vars'  : ['warn', { argsIgnorePattern : '^_' }],
            // Relax for Bryntum config objects
            '@typescript-eslint/no-explicit-any' : 'warn'
        }
    }
];