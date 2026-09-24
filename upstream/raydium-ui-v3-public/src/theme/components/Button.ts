import { colors } from '../cssVariables'

export const Button = {
  baseStyle: {
    fontWeight: '600',
    cursor: 'pointer',
    letterSpacing: '-0.01em',
    transitionProperty: 'background, color, border-color, box-shadow, transform, opacity',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
    _focusVisible: { boxShadow: `0 0 0 2px ${colors.backgroundDark}, 0 0 0 4px ${colors.semanticFocus}`, outline: 'none' },
    _active: { transform: 'translateY(1px)' },
    _disabled: { cursor: 'not-allowed', opacity: 0.45, transform: 'none' }
  },
  sizes: {
    xs: {
      height: '20px',
      paddingInline: '6px'
    },
    sm: {
      minHeight: '30px',
      minWidth: '100px'
    },
    md: {
      minHeight: '40px',
      minWidth: '120px'
    }
  },
  variants: {
    solid: {
      background: colors.solidButtonBg,
      color: colors.buttonSolidText,
      _hover: { background: colors.buttonPrimary__02, _disabled: { background: colors.solidButtonBg } },
      _active: { background: colors.buttonPrimary__02, transform: 'translateY(1px)' },
      _loading: { opacity: 0.8, cursor: 'progress' },
      '&:disabled:disabled': { opacity: '0.45', background: colors.solidButtonBg }
    },
    'solid-dark': {
      background: colors.backgroundDark,
      color: colors.textSecondary,
      _hover: {
        opacity: '0.9',
        background: colors.backgroundDark50
      },
      '&:disabled:disabled': {
        opacity: '0.5',
        background: colors.solidButtonBg
      }
    },
    capsule: {
      background: colors.backgroundTransparent12,
      color: colors.textTertiary,
      border: '1px solid transparent',
      borderRadius: '100px',
      minWidth: 'revert',
      minHeight: 'revert',
      _hover: {
        background: colors.backgroundTransparent07
      },
      _active: {
        borderColor: `var(--active-border-color, ${colors.selectActive})`,
        color: `var(--active-color, ${colors.textSecondary})`
      },
      '&:disabled:disabled': {
        opacity: '0.5',
        cursor: 'not-allowed'
      }
    },
    'capsule-radio': {
      bg: colors.backgroundTransparent12,
      color: colors.textSecondary,
      border: '1px solid transparent',
      borderRadius: '100px',
      minWidth: 'revert',
      minHeight: 'revert',
      _hover: {
        background: colors.backgroundTransparent07
      },
      _active: {
        borderColor: `var(--active-border-color, ${colors.selectActiveSecondary})`,
        color: `var(--active-color, ${colors.textPrimary})`,
        fontWeight: 500
      },
      '&:disabled:disabled': {
        opacity: '0.5',
        cursor: 'not-allowed'
      }
    },
    'rect-rounded-radio': {
      background: colors.backgroundTransparent12,
      color: colors.textTertiary,
      borderRadius: '4px',
      minWidth: 'revert',
      minHeight: 'revert',
      _hover: {
        background: colors.backgroundTransparent07
      },
      _active: {
        color: colors.textSecondary
      },
      '&:disabled:disabled': {
        opacity: '0.5',
        cursor: 'not-allowed'
      }
    },
    outline: {
      borderColor: colors.secondary,
      color: colors.secondary,
      _hover: {
        opacity: '0.9',
        background: colors.outlineButtonBg
      },
      _active: {
        filter: 'brightness(0.7)',
        opacity: '0.9',
        background: colors.outlineButtonBg
      },
      '&:disabled:disabled': {
        opacity: '0.5'
      }
    },
    ghost: {
      color: colors.secondary,
      minWidth: 'revert',
      minHeight: 'revert',
      _hover: {
        opacity: '0.9',
        background: colors.outlineButtonBg
      },
      _active: {
        filter: 'brightness(0.7)',
        opacity: '0.9',
        background: colors.outlineButtonBg
      },
      '&:disabled:disabled': {
        opacity: '0.5'
      }
    },
    danger: {
      background: colors.textPink,
      color: colors.buttonSolidText,
      _hover: {
        opacity: '0.9',
        background: colors.textPink
      },
      _active: {
        filter: 'brightness(0.7)',
        opacity: '0.9',
        background: colors.textPink
      },
      '&:disabled:disabled': {
        opacity: '0.5',
        background: colors.textPink
      }
    }
  }
}
