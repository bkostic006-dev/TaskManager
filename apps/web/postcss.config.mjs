/**
 * Mantine 8 ships its styles as PostCSS: without `postcss-preset-mantine` the
 * `light-dark()`, `rem()` and nested-selector syntax in its CSS never compiles.
 * `postcss-simple-vars` resolves the `$mantine-breakpoint-*` variables used in
 * media queries.
 */
const config = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};

export default config;
