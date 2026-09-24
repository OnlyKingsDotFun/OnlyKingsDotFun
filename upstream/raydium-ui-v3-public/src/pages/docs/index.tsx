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
          Think of a pot as a melting pot for like tokens. Choose a pot, put one token in, and take another token out.
        </Text>
      </Box>
      {[
        ['Find your pot', 'Dollar tokens go with dollar tokens. Staked SOL tokens go with tokens backed by SOL. Each pot tells you which tokens belong.'],
        ['Pick what goes in and out', 'Choose a token you have, enter an amount, and choose another token in the same pot. You do not need to choose a market-making engine or understand its mechanics.'],
        ['Review and confirm', 'See what you give, what you receive, and the fee before your wallet asks you to approve. The live quote is the amount to use.'],
        ['The pot’s rate', 'One-to-one is the default reference rate. Staked tokens can use the value of the SOL underneath. Fees and the balance of tokens in the pot affect the final amount you receive.'],
        ['What is available today', 'The pots directory and in-pot swaps are still being connected. The separate Swap and Liquidity pages use existing market integrations. No example pot here represents a live balance or completed swap.']
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
      <Box as="details" borderTop={`1px solid ${colors.dividerBg}`} pt={6}>
        <Box as="summary" cursor="pointer" color={colors.textSecondary}>
          Under the hood
        </Box>
        <Text mt={4} color={colors.textTertiary} lineHeight="1.8">
          Pots use collection pools in the CPMM and CLMM forks. Within a pot, swaps use a curve that prices tokens around their
          reference rates. The gauge program supports CPMM collections; CLMM gauges and the voting interface still need integration.
          Launch and graduation programs are optional.
        </Text>
      </Box>
      <Button as={Link} href="/collections" alignSelf="start">
        Explore pots ↗
      </Button>
    </VStack>
  )
}

export const getStaticProps = async () => ({ props: { title: 'How it works' } })
