import dynamic from 'next/dynamic'
const Vote = dynamic(() => import('@/features/Vote'))
function VotePage() {
  return <Vote />
}
export default VotePage
export async function getStaticProps() {
  return { props: { title: 'Vote' } }
}
