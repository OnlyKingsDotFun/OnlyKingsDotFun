import dynamic from 'next/dynamic'
const Collections = dynamic(() => import('@/features/Collections'))
function CollectionsPage() {
  return <Collections />
}
export default CollectionsPage
export async function getStaticProps() {
  return { props: { title: 'Collections' } }
}
