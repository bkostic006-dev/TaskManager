// Tally — Mantine theme
// Direction: "your day, counted out loud." Light mode, cool slate-teal neutrals,
// teal for anything interactive, brass reserved strictly for lateness.
// Near-monochrome by choice: see direction.md, "Revision — accent moved from plum to teal".
// Mantine v7/v8 (createTheme + CSS variables).

import {
  createTheme,
  type MantineColorsTuple,
  Button,
  Paper,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Badge,
  Drawer,
  Modal,
  Notification,
  SegmentedControl,
  Pagination,
  Anchor,
  Title,
  ActionIcon,
  Tooltip,
  Alert,
  PasswordInput,
} from '@mantine/core';

/* ------------------------------------------------------------------ *
 * Raw tokens — the single source of truth. Mirrors direction.md.
 * ------------------------------------------------------------------ */

export const tally = {
  mist: '#EEF1F1',
  card: '#FBFCFC',
  ink: '#14262A',
  slate: '#596E72',
  teal: '#2F4C56',
  brass: '#8A6410',
  // derived tints — not new colors
  tealSoft: '#E9EEEF',
  brassSoft: '#F6EFDC',
  edge: '#D6DCDD',
  edgeStrong: '#BDC7C8',
  numeral: '#77898C',
  rowDone: '#F4F7F7',
} as const;

export const fonts = {
  display: "'Big Shoulders Display', 'Arial Narrow', sans-serif",
  body: "'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

/* Interactive accent. Brand sits at index 6 so primaryShade 6 is the filled
   button and Mantine's hover (shade + 1) lands on a genuinely darker teal. */
const teal: MantineColorsTuple = [
  '#E9EEEF',
  '#D3DEE0',
  '#A9BEC3',
  '#7E9DA5',
  '#5C8090',
  '#416575',
  '#2F4C56', // brand
  '#274048',
  '#1F343A',
  '#17272C',
];

/* Lateness only. */
const brass: MantineColorsTuple = [
  '#F6EFDC',
  '#EEE2C2',
  '#DFC98C',
  '#CFAF57',
  '#BE9A2E',
  '#A47B19',
  '#8A6410', // brand
  '#75540D',
  '#60440A',
  '#4B3507',
];

/* Cool slate-teal neutrals — replaces Mantine's default gray everywhere.
   ink[6] is the numeral color; ink[9] is the completed marker and body text. */
const ink: MantineColorsTuple = [
  '#FBFCFC',
  '#EEF1F1',
  '#DFE4E5',
  '#D6DCDD',
  '#BDC7C8',
  '#9AAAAC',
  '#77898C',
  '#596E72',
  '#33484C',
  '#14262A',
];

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

export const theme = createTheme({
  colors: { teal, brass, ink, gray: ink, dark: ink },
  primaryColor: 'teal',
  primaryShade: { light: 6, dark: 4 },
  white: tally.card,
  black: tally.ink,

  fontFamily: fonts.body,
  fontFamilyMonospace: fonts.body, // tabular-nums does the numeric work; no mono face
  lineHeights: { xs: '1.3', sm: '1.4', md: '1.5', lg: '1.55', xl: '1.6' },
  fontSizes: {
    xs: '11px',
    sm: '12.5px',
    md: '14px', // dense-row floor
    lg: '16px',
    xl: '19px',
  },

  headings: {
    fontFamily: fonts.display,
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '30px', lineHeight: '1.1' },
      h2: { fontSize: '24px', lineHeight: '1.15' },
      h3: { fontSize: '20px', lineHeight: '1.2' },
      // h4–h6 drop back to the body face: display type is banned below 20px.
      h4: { fontSize: '16px', lineHeight: '1.35', fontWeight: '700' },
      h5: { fontSize: '14px', lineHeight: '1.4', fontWeight: '700' },
      h6: { fontSize: '12.5px', lineHeight: '1.4', fontWeight: '700' },
    },
  },

  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px' },

  spacing: { xs: '6px', sm: '10px', md: '16px', lg: '24px', xl: '36px' },

  shadows: {
    xs: '0 1px 2px rgba(20, 38, 42, 0.06)',
    sm: '0 2px 6px rgba(20, 38, 42, 0.09)',
    md: '0 10px 28px -8px rgba(20, 38, 42, 0.20)',
    lg: '0 10px 28px -8px rgba(20, 38, 42, 0.20)',
    xl: '0 10px 28px -8px rgba(20, 38, 42, 0.20)',
  },

  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,

  other: {
    tally,
    fonts,
    rowHeight: 48, // compact — the shipped default. 60 is the comfortable alternative.
    rowHeightComfortable: 60,
    numeralGutter: 44,
    listGap: 8,
    sectionGap: 36,
    transition: 'box-shadow 120ms ease, border-color 120ms ease, background-color 120ms ease, color 120ms ease',
    // The signature. Apply to row indices, the hero count, pagination, empty-state figures.
    numeral: {
      fontFamily: fonts.display,
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1,
      color: tally.numeral,
      // Hover darkens to ink — value, not hue. The accent is too close to the
      // neutrals to register as a hover cue.
      hoverColor: tally.ink,
    },
    // Completion is stated in the neutral so a finished task never reads as clickable.
    completedMarker: { size: 28, radius: 6, background: tally.ink, glyph: tally.card },
    demoCredentials: { email: 'dana@northbay.dev', password: 'tally-demo-2026' },
  },

  /* ---------------------------------------------------------------- *
   * Component defaults — only where they carry the direction.
   * ---------------------------------------------------------------- */
  components: {
    Button: Button.extend({
      defaultProps: { radius: 'md', size: 'sm' },
      styles: {
        root: { fontWeight: 700, fontSize: '13.5px', letterSpacing: '0.005em' },
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: 'subtle', color: 'ink', radius: 'md' },
    }),

    // Task rows, toolbar, drawer body, toasts.
    Paper: Paper.extend({
      defaultProps: {
        radius: 'md',
        shadow: 'xs',
        withBorder: true,
        bg: tally.card,
      },
    }),

    TextInput: TextInput.extend({
      defaultProps: { radius: 'md', size: 'sm' },
      styles: {
        input: { backgroundColor: tally.card, borderColor: tally.edge, fontSize: '14px' },
        label: { fontSize: '12.5px', fontWeight: 700, marginBottom: 6, color: tally.ink },
        error: { fontSize: '12.5px' },
      },
    }),

    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: 'md', size: 'sm' },
      styles: {
        input: { backgroundColor: tally.card, borderColor: tally.edge, fontSize: '14px' },
        label: { fontSize: '12.5px', fontWeight: 700, marginBottom: 6, color: tally.ink },
      },
    }),

    Textarea: Textarea.extend({
      defaultProps: { radius: 'md', size: 'sm', autosize: true, minRows: 3 },
      styles: {
        input: { backgroundColor: tally.card, borderColor: tally.edge, fontSize: '14px' },
        label: { fontSize: '12.5px', fontWeight: 700, marginBottom: 6, color: tally.ink },
      },
    }),

    Select: Select.extend({
      defaultProps: { radius: 'md', size: 'sm', allowDeselect: false, checkIconPosition: 'right' },
      styles: {
        input: { backgroundColor: tally.card, borderColor: tally.edge, fontSize: '13.5px' },
        label: { fontSize: '12.5px', fontWeight: 700, marginBottom: 6, color: tally.ink },
      },
    }),

    Checkbox: Checkbox.extend({
      defaultProps: { radius: 'sm', size: 'sm', color: 'teal' },
      styles: { input: { borderColor: tally.edgeStrong, cursor: 'pointer' } },
    }),

    // Status badge is the one pill in the system, and always carries text.
    Badge: Badge.extend({
      defaultProps: { radius: 'xl', variant: 'light', size: 'sm' },
      styles: {
        root: { fontWeight: 700, fontSize: '10.5px', letterSpacing: '0.08em', textTransform: 'uppercase' },
      },
    }),

    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'md', size: 'sm', color: 'teal' },
      styles: {
        root: { backgroundColor: tally.mist, border: `1px solid ${tally.edge}` },
        label: { fontWeight: 700, fontSize: '12.5px' },
      },
    }),

    // Right drawer, not a modal: the list stays visible while you edit a row.
    Drawer: Drawer.extend({
      defaultProps: {
        position: 'right',
        size: 420,
        radius: 0,
        overlayProps: { backgroundOpacity: 0.35, blur: 0 },
        transitionProps: { duration: 140 },
      },
      styles: {
        content: { backgroundColor: tally.card },
        header: { backgroundColor: tally.card, borderBottom: `1px solid ${tally.edge}`, paddingBlock: 16 },
        title: { fontFamily: fonts.display, fontSize: '24px', fontWeight: 600 },
      },
    }),

    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.35 } },
      styles: { title: { fontFamily: fonts.display, fontSize: '24px', fontWeight: 600 } },
    }),

    // Login form-level errors and the overdue note. Brass, never red.
    Alert: Alert.extend({
      defaultProps: { variant: 'light', color: 'brass', radius: 'md' },
      styles: {
        title: { fontSize: '13px', fontWeight: 700, color: tally.ink },
        message: { fontSize: '12.8px', lineHeight: 1.45 },
      },
    }),

    Notification: Notification.extend({
      defaultProps: { radius: 'lg', withBorder: true },
      styles: {
        root: { boxShadow: '0 10px 28px -8px rgba(20, 38, 42, 0.20)', backgroundColor: tally.card },
        title: { fontSize: '14px', fontWeight: 700 },
        description: { fontSize: '12.5px', color: tally.slate },
      },
    }),

    // Page numbers are part of the numeral system.
    Pagination: Pagination.extend({
      defaultProps: { radius: 'md', size: 'md', color: 'teal', withEdges: false },
      styles: {
        control: {
          fontFamily: fonts.display,
          fontSize: '18px',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          borderColor: tally.edge,
        },
      },
    }),

    Anchor: Anchor.extend({
      defaultProps: { c: 'teal.6', underline: 'always' },
      styles: { root: { fontWeight: 700 } },
    }),

    Title: Title.extend({
      styles: { root: { letterSpacing: '0.01em' } },
    }),

    Tooltip: Tooltip.extend({
      defaultProps: { radius: 'sm', withArrow: true, color: 'ink.9' },
    }),
  },
});

export default theme;

/* ------------------------------------------------------------------ *
 * Dark variant — secondary mode. Light (above) is the shipped default.
 * Same roles, re-valued. See direction.md, "Dark variant".
 * ------------------------------------------------------------------ */

export const tallyDark = {
  night: '#0F1A1C',
  shelf: '#162427',
  chalk: '#E8EDED',
  pewter: '#9FB0B2',
  tealLit: '#8FB3BC',
  tealFill: '#416575',
  brassLit: '#D6A93C',
  numeral: '#6D8286',
  tealSoft: '#1B282C',
  brassSoft: '#2C2415',
  edge: '#29393D',
  edgeStrong: '#3B4E53',
  rowDone: '#131F22',
} as const;

/* Dark neutral ramp. Mantine reads colors.dark[7] as the body background and
   colors.dark[6] / [4] for surfaces and borders. */
const inkDark: MantineColorsTuple = [
  '#E8EDED',
  '#C9D4D5',
  '#9FB0B2',
  '#77898C',
  '#3B4E53',
  '#29393D',
  '#162427', // surfaces
  '#0F1A1C', // app background
  '#0B1416',
  '#070F10',
];

/* On dark the accent is lightened, never saturated.
   primaryShade.dark = 4 puts #8FB3BC on text and borders; filled buttons pin to teal[5]. */
const tealDark: MantineColorsTuple = [
  '#E9EEEF',
  '#D8E3E5',
  '#BCD0D4',
  '#A6C3C9',
  '#8FB3BC', // brand, dark mode
  '#416575', // filled button surface
  '#2F4C56',
  '#274048',
  '#1F343A',
  '#17272C',
];

export const themeDark = createTheme({
  ...theme,
  colors: { ...theme.colors, teal: tealDark, brass, ink: inkDark, gray: inkDark, dark: inkDark },
  primaryColor: 'teal',
  primaryShade: { light: 6, dark: 4 },
  white: tallyDark.chalk,
  black: tallyDark.night,
  other: {
    ...theme.other,
    tallyDark,
    // Dark rules that differ in kind, not just in value:
    darkRules: [
      'Completed rows get darker (rowDone #131F22), never lighter — recession reads as closed.',
      'Borders carry hover, not shadows: border-color edge to edgeStrong.',
      'Lighten accents, never saturate them.',
      'The completed marker stays neutral (chalk on rowDone border), never the accent.',
    ],
  },
});
