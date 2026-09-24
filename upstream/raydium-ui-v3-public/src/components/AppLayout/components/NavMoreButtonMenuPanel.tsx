import ExternalLink from '@/icons/misc/ExternalLink'
import DocThumbnailIcon from '@/icons/pageNavigation/DocThumbnailIcon'
import DisclaimerThumbnailIcon from '@/icons/pageNavigation/DisclaimerThumbnailIcon'
import { colors } from '@/theme/cssVariables'
import { Box, HStack, MenuItem, MenuList, Text, Link } from '@chakra-ui/react'
import NextLink from 'next/link'

import { useTranslation } from 'react-i18next'

export function NavMoreButtonMenuPanel() {
  const { t } = useTranslation()
  return (
    <MenuList>
      <Box py={3}>
        <MenuItem>
          <Link as={NextLink} href="/docs/disclaimer" _hover={{ textDecoration: 'none' }} w="full" isExternal>
            <HStack>
              <DisclaimerThumbnailIcon />
              <Text>{t('disclaimer.title')}</Text>
              <ExternalLink color={colors.textSecondary} />
            </HStack>
          </Link>
        </MenuItem>
        <MenuItem>
          <Link as={NextLink} href="/docs" _hover={{ textDecoration: 'none' }} w="full" isExternal>
            <HStack>
              <DocThumbnailIcon />
              <Text>{t('common.nav_text_docs')}</Text>
              <ExternalLink color={colors.textSecondary} />
            </HStack>
          </Link>
        </MenuItem>
      </Box>
    </MenuList>
  )
}
