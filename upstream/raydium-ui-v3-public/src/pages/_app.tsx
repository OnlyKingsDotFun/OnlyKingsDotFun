import { BRAND } from '@/constants/brand'
import { getCookie } from 'cookies-next'
import type { AppContext, AppProps } from 'next/app'
import App from 'next/app'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import Decimal from 'decimal.js'

import i18n from '../i18n'
import { isClient } from '../utils/common'
import '@/components/Toast/toast.css'
import 'react-day-picker/dist/style.css'
import { OnboardingDialog } from '@/components/Dialogs/OnboardingDialog'
import { DialogManager } from '@/components/DialogManager'

const DynamicProviders = dynamic(() => import('@/provider').then((mod) => mod.Providers))
const DynamicContent = dynamic(() => import('@/components/Content'))
const DynamicAppNavLayout = dynamic(() => import('@/components/AppLayout/AppNavLayout'), { ssr: false })

const CONTENT_ONLY_PATH = ['/', '404', '/moonpay']
const OVERFLOW_HIDDEN_PATH = ['/liquidity-pools']

Decimal.set({ precision: 1e3 })

const MyApp = ({ Component, pageProps, ...props }: AppProps) => {
  const { pathname } = useRouter()

  const [onlyContent, overflowHidden] = useMemo(
    () => [CONTENT_ONLY_PATH.includes(pathname), OVERFLOW_HIDDEN_PATH.includes(pathname)],
    [pathname]
  )

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={BRAND.shortDescription} />
        <meta name="theme-color" content={BRAND.themeColor} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BRAND.url}/social-card.png`} />
        <meta property="og:image" content={`${BRAND.url}/social-card.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="OnlyKings.fun — Good assets. Better together." />
        <meta name="twitter:title" content={BRAND.name} />
        <meta name="twitter:description" content={BRAND.shortDescription} />
        <meta property="og:description" content={BRAND.shortDescription} />
        <meta property="og:url" content={BRAND.url} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en" />
        <meta property="og:site_name" content={BRAND.name} />
        <meta property="og:title" content={BRAND.name} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <title>{pageProps?.title ? `${pageProps.title} · ${BRAND.name}` : BRAND.name}</title>
      </Head>
      <DynamicProviders>
        <DynamicContent {...props}>
          {onlyContent ? (
            <Component {...pageProps} />
          ) : (
            <DynamicAppNavLayout overflowHidden={overflowHidden}>
              <Component {...pageProps} />
            </DynamicAppNavLayout>
          )}
        </DynamicContent>
        <DialogManager />
        <OnboardingDialog />
      </DynamicProviders>
    </>
  )
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  if (isClient()) return {}
  try {
    const ctx = await App.getInitialProps(appContext)
    let lng = getCookie('i18nextLng', { req: appContext.ctx.req, res: appContext.ctx.res }) as string
    lng = lng || 'en'
    i18n.changeLanguage(lng)

    return ctx
  } catch (err) {
    return {}
  }
}

export default MyApp
