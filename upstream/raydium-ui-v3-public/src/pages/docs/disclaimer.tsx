import { Box, Heading, Text, VStack } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { colors } from '@/theme/cssVariables'

export default function DisclaimerPage() {
  const { t } = useTranslation()
  return (
    <VStack align="stretch" spacing={6} maxW="800px" mx="auto" py={[6, 12]} px={[4, 0]}>
      <Heading as="h1" size="xl">
        {t('disclaimer.title')}
      </Heading>
      <Box border={`1px solid ${colors.dividerBg}`} borderRadius="20px" bg={colors.backgroundLight} p={[6, 10]}>
        {[1, 2, 3, 4].map((n) => (
          <Text key={n} mb={n < 4 ? 5 : 0} lineHeight="1.8" color={colors.textSecondary}>
            {t(`disclaimer.text${n}`)}
          </Text>
        ))}
      </Box>
    </VStack>
  )
}

export const getStaticProps = async () => ({ props: { title: 'About this interface' } })
