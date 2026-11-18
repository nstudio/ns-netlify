/**
 * One design language for web and phone. The web app turns these into CSS
 * custom properties; the phone app into its app.css and inline styles.
 */
export const tokens = {
  color: {
    /** Netlify's teal: actions, live state, the brand mark. */
    accent: '#05bdba',
    accentBright: '#32e6e2',
    /** NativeScript's blue: anything that says "on your phone". */
    native: '#3a53ff',
    ink: '#0d1117',
    inkSoft: '#1a2230',
    paper: '#f7f5f0',
    card: '#ffffff',
    line: '#e4e0d6',
    text: '#14171c',
    textSoft: '#5b6370',
    textOnInk: '#f4f7fb',
    danger: '#e5484d',
  },
  radius: { card: 18, chip: 999, photo: 14 },
  font: {
    /** Headlines; system fallbacks on each platform. */
    display: 'Fraunces, Georgia, serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, monospace',
  },
} as const;

export const APP_NAME = 'Field Notes';
export const TAGLINE = 'Capture the world on your phone. Explore it on the web.';
