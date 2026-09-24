import { SvgIcon } from './type'

/** Three open points: a crown that remains legible at favicon size. */
export default function BrandLogo(props: SvgIcon) {
  return (
    <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M6 12L14 19L20 8L26 19L34 12L30 29H10L6 12Z" fill="currentColor" />
      <path d="M11 34H29" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
