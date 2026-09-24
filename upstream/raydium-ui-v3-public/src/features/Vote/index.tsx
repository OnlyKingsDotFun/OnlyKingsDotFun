import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { colors } from '@/theme/cssVariables'
import { panelCard } from '@/theme/cssBlocks'

export default function Vote() {
  const { t } = useTranslation()
  return (
    <Flex direction="column" gap={6} maxW="900px" mx="auto" w="full" px={[4, 0]} py={[4, 8]}>
      <Box maxW="62ch">
        <Heading as="h1" fontSize={['2xl', '3xl']} fontWeight="700" color={colors.textPrimary} mb={2}>
          {t('vote.title')}
        </Heading>
        <Text color={colors.textSecondary} fontSize="md" lineHeight="1.55">
          {t('vote.subtitle')}
        </Text>
      </Box>
      <Box {...panelCard} p={6}>
        <Text color={colors.textTertiary} fontSize="sm">
          {t('vote.coming')}
        </Text>
      </Box>
    </Flex>
  )
}
