import { colors } from './cssVariables'

/**
 * Global styles. Type: Space Grotesk (bundled) for UI and headings, tabular figures everywhere a
 * number can appear, a real focus ring, reduced-motion respected.
 */
export const styles = {
  global: {
    '@font-face': {
      fontFamily: 'Space Grotesk',
      src: "url('/SpaceGrotesk[wght].woff2') format('woff2')",
      fontWeight: '300 700',
      fontDisplay: 'swap'
    },
    'html, body, #__next, #app-layout': { height: '100%' },
    body: {
      fontFeatureSettings: "'tnum' 1, 'ss04' 1",
      background: colors.backgroundApp,
      color: colors.textPrimary,
      letterSpacing: '-0.005em',
      textRendering: 'optimizeLegibility'
    },
    'h1, h2, h3, h4': { letterSpacing: '-0.02em' },
    '::selection': { background: colors.secondary10, color: colors.textPrimary },
    ':focus-visible': {
      outline: `2px solid ${colors.semanticFocus}`,
      outlineOffset: '2px',
      borderRadius: '6px'
    },
    '::-webkit-scrollbar': { backgroundColor: 'transparent', width: '7px', height: '7px' },
    '::-webkit-scrollbar-thumb': { backgroundColor: colors.scrollbarThumb, borderRadius: '8px' },
    '@media (prefers-reduced-motion: reduce)': {
      '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' }
    }
  }
}
