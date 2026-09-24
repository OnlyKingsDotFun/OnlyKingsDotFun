/**
 * Chart placeholder. The original TVChart needs TradingView's licensed `charting_library` bundle, which is
 * not distributed with this repo (kept at TVChart.licensed.tsx). Drop the library into
 * src/charting_library and swap the default export back to restore candles.
 */
import { Box, Text } from '@chakra-ui/react'
import { colors } from '@/theme/cssVariables'

export default function TVChart({ height = '100%', mintInfo, mintBInfo }: { poolId?: string; mint?: string; height?: string; id?: string; birdeye?: boolean; mintInfo?: any; mintBInfo?: any; curveType?: any; needRefresh?: boolean }) {
  const pair = [mintInfo?.symbol, mintBInfo?.symbol].filter(Boolean).join(' / ')
  return (
    <Box
      height={height}
      minH="220px"
      display="grid"
      placeItems="center"
      borderRadius="12px"
      border={`1px dashed ${colors.dividerBg}`}
      color={colors.textTertiary}
      fontSize="sm"
      style={{ fontFeatureSettings: "'tnum' 1" }}
    >
      <Text>{pair ? `${pair} · chart unavailable` : 'chart unavailable'}</Text>
    </Box>
  )
}
