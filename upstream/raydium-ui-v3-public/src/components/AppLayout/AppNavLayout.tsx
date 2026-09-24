import { useDisclosure } from '@/hooks/useDelayDisclosure'
import BrandLogo from '@/icons/BrandLogo'
import BrandLogoOutline from '@/icons/BrandLogoOutline'
import { BRAND } from '@/constants/brand'
import ChevronDownIcon from '@/icons/misc/ChevronDownIcon'
import Gear from '@/icons/misc/Gear'
import { useAppStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { appLayoutPaddingX } from '@/theme/detailConfig'
import {
  Box,
  Flex,
  HStack,
  Menu,
  MenuButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  SystemStyleObject
} from '@chakra-ui/react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { ReactNode, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Desktop, Mobile } from '../MobileDesktop'
import SolWallet from '../SolWallet'
import { MobileBottomNavbar } from './MobileBottomNavbar'
import { ColorThemeSettingField } from './components/ColorThemeSettingField'
import { DefaultExplorerSettingField } from './components/DefaultExplorerSettingField'
import { LanguageSettingField } from './components/LanguageSettingField'
import { NavMoreButtonMenuPanel } from './components/NavMoreButtonMenuPanel'
import { RPCConnectionSettingField } from './components/RPCConnectionSettingField'
import { Divider } from './components/SettingFieldDivider'
import { SlippageToleranceSettingField } from './components/SlippageToleranceSettingField'
import { VersionedTransactionSettingField } from './components/VersionedTransactionSettingField'
import { PriorityButton } from './components/PriorityButton'
import DisclaimerModal from './components/DisclaimerModal'
import AppVersion from './AppVersion'

export interface NavSettings {
  // colorTheme: 'dark' | 'light'
}

function AppNavLayout({
  children,
  overflowHidden
}: {
  children: ReactNode
  /** use screen height */
  overflowHidden?: boolean
}) {
  const { t } = useTranslation()
  const { pathname } = useRouter()

  return (
    <Flex direction="column" id="app-layout" height="full" overflow={overflowHidden ? 'hidden' : 'auto'}>
      <HStack
        className="navbar"
        borderBottom={`1px solid ${colors.dividerBg}`}
        flex="none"
        height={['64px', '80px']}
        px={['20px', 0, '38px']}
        gap={['4px', 0, 0, 6]}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* logo */}
        <Desktop>
          <Box flex={'none'}>
            <Link href="/" aria-label="OnlyKings.fun home">
              <HStack gap={2.5} color={colors.secondary} _hover={{ color: colors.textPrimary }} transition="color 140ms">
                <BrandLogo />
                <Text fontWeight="700" fontSize="lg" letterSpacing="-0.02em">
                  {BRAND.name}
                </Text>
              </HStack>
            </Link>
          </Box>
        </Desktop>
        <Mobile>
          <Link href="/" aria-label="OnlyKings.fun home">
            <HStack color={colors.secondary} spacing={1.5}>
              <BrandLogoOutline />
              <Text fontSize="md" fontWeight="700" letterSpacing="-0.04em">
                {BRAND.shortName}
                <Box as="span" color={colors.textTertiary}>
                  .fun
                </Box>
              </Text>
            </HStack>
          </Link>
        </Mobile>

        {/* nav routes */}
        <Desktop>
          <HStack flexGrow={1} justify="start" overflow={['auto', 'visible']} gap={[15, 0, 15]}>
            <RouteLink href="/swap" isActive={pathname === '/swap'} title={t('swap.title')} />
            <RouteLink
              href="/liquidity-pools"
              isActive={pathname.includes('/liquidity') || pathname.includes('/clmm')}
              title={t('liquidity.title')}
            />
            <RouteLink href="/collections" isActive={pathname.includes('/collections')} title={t('collections.title')} />
            <RouteLink href="/launchpad" isActive={pathname.includes('/launchpad')} title={t('launchpad.title')} />
            <RouteLink href="/vote" isActive={pathname === '/vote'} title={t('vote.title')} />
            <RouteLink href="/portfolio" isActive={pathname === '/portfolio'} title={t('portfolio.title')} />
          </HStack>
        </Desktop>

        {/* wallet button */}
        <Flex gap={[0.5, 2]} align="center">
          <PriorityButton />
          <SettingsMenu />
          {/* <EVMWallet />  don't need currently yet*/}
          <SolWallet />
        </Flex>
      </HStack>

      <Box
        px={appLayoutPaddingX}
        pt={[0, 4]}
        flex={1}
        overflow={overflowHidden ? 'hidden' : 'auto'}
        display="flex"
        flexDirection="column"
        justifyItems={'flex-start'}
        sx={{
          scrollbarGutter: 'stable',
          contain: 'size',
          '& > *': {
            // for flex-col container
            flex: 'none'
          }
        }}
      >
        {children}
      </Box>
      <DisclaimerModal />
      <Mobile>
        <Box className="mobile_bottom_navbar" flex="none">
          <MobileBottomNavbar />
        </Box>
      </Mobile>
    </Flex>
  )
}

function RouteLink({
  href,
  isActive,
  title,
  external = false,
  sx,
  slotAfter
}: {
  href: string
  isActive: boolean
  title: string | React.ReactNode
  external?: boolean
  sx?: SystemStyleObject
  slotAfter?: ReactNode
}) {
  return (
    <Link
      href={href}
      shallow
      {...(external
        ? {
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        : {})}
    >
      <Flex
        textColor={isActive ? colors.textSecondary : colors.textTertiary}
        fontSize={['sm', 'sm', 'md']}
        px={3}
        py={2}
        rounded="xl"
        transition="200ms"
        _hover={{ bg: colors.backgroundLight, color: colors.textSecondary }}
        alignItems="center"
        sx={sx}
      >
        {title}
        {slotAfter}
      </Flex>
    </Link>
  )
}

function SettingsMenu() {
  const { isOpen, onClose, onOpen } = useDisclosure()
  const triggerRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <Box
        w={10}
        h={10}
        p="0"
        onClick={() => onOpen()}
        _hover={{ bg: colors.backgroundLight }}
        rounded="full"
        display="grid"
        placeContent="center"
        cursor="pointer"
        ref={triggerRef}
      >
        <Gear />
      </Box>
      <SettingsMenuModalContent isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} />
    </>
  )
}

function SettingsMenuModalContent(props: { isOpen: boolean; triggerRef: React.RefObject<HTMLDivElement>; onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const triggerPanelGap = 8
  const isMobile = useAppStore((s) => s.isMobile)
  const getTriggerRect = () => props.triggerRef.current?.getBoundingClientRect()

  return (
    <Modal size={'lg'} isOpen={props.isOpen} onClose={props.onClose}>
      <ModalOverlay />
      <ModalContent
        css={{
          transform: (() => {
            const triggerRect = getTriggerRect()
            return (
              triggerRect
                ? `translate(${isMobile ? 0 : -(window.innerWidth - triggerRect.right)}px, ${
                    triggerRect.bottom + triggerPanelGap
                  }px) !important`
                : undefined
            ) as string | undefined
          })()
        }}
        ref={contentRef}
        marginTop={0}
        marginRight={['auto', 0]}
      >
        <ModalHeader>{t('setting_board.panel_title')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <SlippageToleranceSettingField />
          <Divider />
          <SlippageToleranceSettingField variant="liquidity" />
          <Divider />
          <VersionedTransactionSettingField />
          <Divider />
          <DefaultExplorerSettingField />
          <Divider />
          <LanguageSettingField />
          <Divider />
          <ColorThemeSettingField />
          <Divider />
          <RPCConnectionSettingField />
          <Divider />
          <AppVersion />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default AppNavLayout
