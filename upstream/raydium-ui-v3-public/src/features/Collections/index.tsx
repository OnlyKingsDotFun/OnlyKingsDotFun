import { Box, Flex, Grid, Heading, Text, Tag, Button } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { colors } from '@/theme/cssVariables'
import { panelCard } from '@/theme/cssBlocks'

/**
 * Collections: a Compare surface. Rows, shared columns, one primary action per row. No hero.
 * Data wiring lands with the SDK `collections` module; this renders the empty and header states.
 */
export default function Collections() {
  const { t } = useTranslation()
  return (
    <Flex direction="column" gap={6} maxW="1100px" mx="auto" w="full" px={[4, 0]} py={[4, 8]}>
      <Flex justify="space-between" align={['start', 'end']} direction={['column', 'row']} gap={4}>
        <Box maxW="62ch">
          <Heading as="h1" fontSize={['2xl', '3xl']} fontWeight="700" color={colors.textPrimary} mb={2}>
            {t('collections.title')}
          </Heading>
          <Text color={colors.textSecondary} fontSize="md" lineHeight="1.55">
            {t('collections.subtitle')}
          </Text>
        </Box>
        <Button variant="solid" size="md" isDisabled>
          {t('collections.create_collection')}
        </Button>
      </Flex>

      <Box {...panelCard} p={0}>
        <Grid
          templateColumns={['1fr', '2fr 1fr 1fr 1fr auto']}
          gap={4}
          px={5}
          py={3}
          borderBottom={`1px solid ${colors.dividerBg}`}
          color={colors.textTertiary}
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="0.06em"
        >
          <Text>{t('collections.title')}</Text>
          <Text display={['none', 'block']}>{t('collections.ruleset')}</Text>
          <Text display={['none', 'block']}>{t('collections.quote')}</Text>
          <Text display={['none', 'block']}>{t('collections.divisor')}</Text>
          <Text display={['none', 'block']}>{t('collections.members')}</Text>
        </Grid>
        <Flex direction="column" align="center" justify="center" py={16} gap={3} color={colors.textTertiary}>
          <Tag size="sm" variant="subtle" bg={colors.backgroundTransparent12} color={colors.textSecondary}>
            {t('collections.rule_pump')} · {t('collections.rule_lst')} · {t('collections.rule_launchpad')}
          </Tag>
          <Text fontSize="sm">{t('collections.empty')}</Text>
        </Flex>
      </Box>
    </Flex>
  )
}
