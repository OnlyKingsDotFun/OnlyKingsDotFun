import { Box, Button, Flex, Heading, Text, VStack } from '@chakra-ui/react'
import Link from 'next/link'
import BrandLogo from '@/icons/BrandLogo'
import { BRAND } from '@/constants/brand'
import { colors } from '@/theme/cssVariables'

export default function ProductGuide() {
  return (
    <VStack align="stretch" spacing={8} maxW="820px" mx="auto" py={[6, 12]} px={[4, 0]}>
      <Box color={colors.secondary}>
        <BrandLogo width="48" height="48" />
      </Box>
      <Box>
        <Text fontSize="xs" color={colors.secondary} letterSpacing="0.15em" mb={3}>
          THE ONLYKINGS GUIDE
        </Text>
        <Heading as="h1" size="2xl">
          {BRAND.tagline}
        </Heading>
        <Text mt={5} fontSize="lg" color={colors.textSecondary}>
          OnlyKings.fun brings swaps, liquidity, and the idea of shared-asset markets into one place.
        </Text>
      </Box>
      {[
        [
          'Trade from your wallet',
          'Choose your tokens in Swap, review the quote and fees, then approve the transaction in your wallet. Existing market data and routes use Raydium infrastructure.'
        ],
        [
          'Explore liquidity',
          'Browse available pools and manage liquidity positions. Pool fees, asset exposure, and price ranges differ; review the details of each position.'
        ],
        [
          'Understand collections',
          'A collection groups assets that satisfy a common rule, such as stablecoins or liquid staking tokens. The planned multipool interface lets collection members trade within the same pool. The directory and creation flow are still being integrated.'
        ],
        [
          'Have a say',
          'The planned voting system connects locks, collection votes, and fee claims. Voting is not live in this interface yet.'
        ],
        [
          'Launch with clarity',
          'The Launch page currently uses the inherited Raydium launch integration. The custom collection graduation flow is separate and is not available in the interface yet.'
        ]
      ].map(([title, body], index) => (
        <Flex key={title} gap={5} borderTop={`1px solid ${colors.dividerBg}`} pt={6}>
          <Text color={colors.secondary} fontFamily="mono" fontSize="sm">
            0{index + 1}
          </Text>
          <Box>
            <Heading as="h2" size="md" mb={3}>
              {title}
            </Heading>
            <Text lineHeight="1.8" color={colors.textSecondary}>
              {body}
            </Text>
          </Box>
        </Flex>
      ))}
      <Button as={Link} href="/swap" alignSelf="start">
        Explore the exchange ↗
      </Button>
    </VStack>
  )
}

export const getStaticProps = async () => ({ props: { title: 'How it works' } })
