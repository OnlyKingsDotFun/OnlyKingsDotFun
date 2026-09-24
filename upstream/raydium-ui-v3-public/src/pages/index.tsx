import { Box, Button, Container, Flex, Grid, Heading, HStack, Text } from '@chakra-ui/react'
import Link from 'next/link'
import BrandLogo from '@/icons/BrandLogo'
import { BRAND } from '@/constants/brand'
import { colors } from '@/theme/cssVariables'

const markets = [
  {
    number: '01',
    label: 'Swap',
    description: 'Find your next position. Trade Solana tokens from your wallet.',
    href: '/swap',
    action: 'Open exchange'
  },
  {
    number: '02',
    label: 'Liquidity',
    description: 'Explore pools and put your assets to work on your own terms.',
    href: '/liquidity-pools',
    action: 'Explore pools'
  },
  {
    number: '03',
    label: 'Collections',
    description: 'Assets that share a rule, together in a market. The next chapter.',
    href: '/collections',
    action: 'See what’s next'
  }
]

export default function Home() {
  return (
    <Box minH="100vh" bg={colors.backgroundApp} color={colors.textPrimary}>
      <Container maxW="1280px" px={[5, 8, 12]}>
        <Flex as="header" align="center" justify="space-between" py={6} borderBottom={`1px solid ${colors.dividerBg}`}>
          <Link href="/" aria-label="OnlyKings.fun home">
            <HStack spacing={2} color={colors.secondary}>
              <BrandLogo />
              <Text fontWeight="700" fontSize={['lg', 'xl']} letterSpacing="-0.04em">
                OnlyKings
                <Box as="span" color={colors.textTertiary}>
                  .fun
                </Box>
              </Text>
            </HStack>
          </Link>
          <HStack spacing={[4, 8]}>
            <Link href="/docs">
              <Text fontSize="sm" color={colors.textSecondary}>
                How it works
              </Text>
            </Link>
            <Button as={Link} href="/swap" size="sm" display={['none', 'inline-flex']}>
              Open app ↗
            </Button>
          </HStack>
        </Flex>

        <Grid as="main" templateColumns={['1fr', '1fr', '1.2fr 1fr']} gap={[10, 12, 16]} alignItems="center" py={[14, 20, 24]}>
          <Box>
            <HStack spacing={3} mb={6} color={colors.secondary}>
              <Box w={5} h="1px" bg="currentColor" />
              <Text fontSize="xs" fontWeight="600" letterSpacing="0.18em" textTransform="uppercase">
                Solana markets. Open to everyone.
              </Text>
            </HStack>
            <Heading as="h1" fontSize={['46px', '64px', '76px']} lineHeight="1.02" letterSpacing="-0.065em" fontWeight="600">
              Good assets.
              <br />
              <Box as="span" color={colors.secondary}>
                Better together.
              </Box>
            </Heading>
            <Text mt={7} maxW="450px" color={colors.textSecondary} fontSize={['md', 'lg']} lineHeight="1.7">
              A home for your next move. Swap tokens, explore liquidity, and discover collections built around what assets share.
            </Text>
            <Flex gap={3} mt={8} wrap="wrap">
              <Button as={Link} href="/swap" size="lg" px={7}>
                Open exchange{' '}
                <Box as="span" ml={5} aria-hidden>
                  ↗
                </Box>
              </Button>
              <Button as={Link} href="/collections" size="lg" variant="outline" px={6}>
                Explore collections
              </Button>
            </Flex>
            <Text mt={5} color={colors.textTertiary} fontSize="xs">
              Your wallet. Your decisions.
            </Text>
          </Box>

          <Box
            position="relative"
            border={`1px solid ${colors.dividerBg}`}
            borderRadius="24px"
            p={[6, 9]}
            bg={colors.backgroundLight}
            overflow="hidden"
          >
            <Box
              position="absolute"
              right={-16}
              top={-8}
              color={colors.secondary}
              opacity={0.035}
              transform="rotate(-12deg)"
              pointerEvents="none"
            >
              <BrandLogo width="340" height="340" />
            </Box>
            <Flex align="center" justify="space-between" mb={10} position="relative">
              <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.16em" color={colors.textTertiary}>
                The collection principle
              </Text>
              <Box color={colors.secondary}>
                <BrandLogo width="28" height="28" />
              </Box>
            </Flex>
            {[
              ['01', 'Stables', 'A shared unit of value'],
              ['02', 'Liquid staking', 'A shared underlying asset'],
              ['03', 'Launch tokens', 'A shared set of rules']
            ].map(([number, name, description]) => (
              <Flex key={number} align="center" gap={4} py={5} borderTop={`1px solid ${colors.dividerBg}`} position="relative">
                <Text fontSize="xs" fontFamily="mono" color={colors.secondary}>
                  {number}
                </Text>
                <Box flex={1}>
                  <Text fontSize="xl" fontWeight="500">
                    {name}
                  </Text>
                  <Text fontSize="sm" mt={1} color={colors.textTertiary}>
                    {description}
                  </Text>
                </Box>
                <Text color={colors.secondary} fontSize="xl" aria-hidden>
                  ↗
                </Text>
              </Flex>
            ))}
            <Text borderTop={`1px solid ${colors.dividerBg}`} pt={5} fontSize="xs" color={colors.textTertiary} lineHeight="1.6">
              One idea: assets with common ground belong in a market together. Collection tools are in development.
            </Text>
          </Box>
        </Grid>

        <Grid
          templateColumns={['1fr', '1fr', 'repeat(3, 1fr)']}
          gap={0}
          borderTop={`1px solid ${colors.dividerBg}`}
          borderBottom={`1px solid ${colors.dividerBg}`}
        >
          {markets.map((market, i) => (
            <Box
              key={market.number}
              py={8}
              pr={[0, 0, 8]}
              pl={[0, 0, i ? 8 : 0]}
              borderLeft={['none', 'none', i ? `1px solid ${colors.dividerBg}` : 'none']}
              borderBottom={[i < 2 ? `1px solid ${colors.dividerBg}` : 'none', null, 'none']}
            >
              <HStack mb={4} justify="space-between">
                <Text fontFamily="mono" fontSize="xs" color={colors.textTertiary}>
                  {market.number} /
                </Text>
                {i === 2 && (
                  <Text fontSize="xs" color={colors.secondary}>
                    In development
                  </Text>
                )}
              </HStack>
              <Heading as="h2" size="md" mb={3}>
                {market.label}
              </Heading>
              <Text color={colors.textTertiary} fontSize="sm" lineHeight="1.7" minH={12} mb={5}>
                {market.description}
              </Text>
              <Link href={market.href}>
                <Text fontSize="sm" fontWeight="600" color={colors.secondary}>
                  {market.action}{' '}
                  <Box as="span" ml={2} aria-hidden>
                    →
                  </Box>
                </Text>
              </Link>
            </Box>
          ))}
        </Grid>
        <Flex as="footer" py={8} gap={4} justify="space-between" direction={['column', 'row']} color={colors.textTertiary} fontSize="xs">
          <Text>{BRAND.name} · A little crown. A bigger playing field.</Text>
          <HStack spacing={6}>
            <Link href="/docs">About the markets</Link>
            <Link href="/docs/disclaimer">About this interface</Link>
          </HStack>
        </Flex>
      </Container>
    </Box>
  )
}
