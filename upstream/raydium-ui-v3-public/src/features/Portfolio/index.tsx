import { useTranslation } from 'react-i18next'
import { Box } from '@chakra-ui/react'
import PageHeroTitle from '@/components/PageHeroTitle'
import SectionMyPositions from './components/SectionMyPositions'
import { PositionTabValues } from '@/hooks/portfolio/useAllPositionInfo'
import SectionOverview from './components/SectionOverview'
import { Desktop } from '@/components/MobileDesktop'

export type PortfolioPageQuery = {
  section?: 'overview' | 'my-positions'
  position_tab?: PositionTabValues
}

export default function Portfolio() {
  const { t } = useTranslation()

  return (
    <Box overflowX="hidden">
      <Desktop>
        <PageHeroTitle title={t('portfolio.hero_title')} />
      </Desktop>
      <SectionOverview />
      <SectionMyPositions />
      <Box pb={'40px'} />
    </Box>
  )
}
