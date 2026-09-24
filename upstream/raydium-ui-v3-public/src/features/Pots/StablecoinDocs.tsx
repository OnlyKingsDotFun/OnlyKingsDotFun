import content from './docs-content.json'
import styles from './prelaunch.module.css'

// Generated from repository-owned Markdown at build time; never accepts user HTML.
export default function StablecoinDocs() {
  return <article className={styles.documentation} dangerouslySetInnerHTML={{ __html: content.stablecoins }} />
}
