import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, Big_Shoulders } from 'next/font/google';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';

import { Providers } from './providers';

/**
 * Both faces are self-hosted by `next/font`: the files are fetched once at build
 * time and served from our own origin, so the first paint never waits on
 * fonts.googleapis.com and there is no third-party request at runtime. Each is
 * exposed as a CSS variable that `theme.ts` reads.
 *
 * `Big_Shoulders` is the design source's "Big Shoulders Display": Google folded
 * the Display cut into the variable `Big Shoulders` family, and that is the only
 * name `next/font` knows.
 */
const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tally',
  description: 'Your day, counted out loud.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables must sit on <html>: Mantine declares
    // --mantine-font-family on :root, and a custom property is substituted in the
    // scope that declares it — on <body> they would resolve to nothing there.
    <html lang="en" className={`${display.variable} ${body.variable}`} {...mantineHtmlProps}>
      <head>
        {/* Must run before first paint: it stamps the colour scheme onto <html>
            so Mantine's CSS variables resolve without a flash of the wrong theme. */}
        <ColorSchemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
