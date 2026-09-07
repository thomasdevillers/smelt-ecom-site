import type { Metadata } from 'next'
import { Bricolage_Grotesque, Space_Grotesk, Caveat } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { CartProvider } from '@/lib/cart'
import Ticker from '@/components/Ticker'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CartDrawer from '@/components/CartDrawer'
import MetaPageViewTracker from '@/components/MetaPageViewTracker'
import { META_PIXEL_ID } from '@/lib/meta'
import { SITE_URL, abs } from '@/lib/seo'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-bricolage',
})
const space = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space',
})
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-caveat',
})

const OG_IMAGE = {
  url: '/images/hat-green-front.jpeg',
  width: 1200,
  height: 1200,
  alt: 'Smelt Forest Green wool felt sauna hat',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Smelt · Sauna hats for people who peak at 90°C',
    template: '%s · Smelt',
  },
  description:
    'Smelt makes 100% merino wool felt sauna hats. Embroidered, not printed. Two colourways, in stock and shipping worldwide from Cape Town.',
  applicationName: 'Smelt',
  keywords: [
    'sauna hat',
    'wool felt sauna hat',
    'merino wool sauna hat',
    'Finnish sauna hat',
    'sauna cap',
    'sauna accessories',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Smelt · Sauna hats for people who peak at 90°C',
    description: '100% wool felt. Embroidered, not printed. Warm regards.',
    url: SITE_URL,
    siteName: 'Smelt',
    images: [OG_IMAGE],
    locale: 'en_ZA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Smelt · Sauna hats for people who peak at 90°C',
    description: '100% wool felt. Embroidered, not printed. Warm regards.',
    images: [OG_IMAGE.url],
  },
}

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Smelt',
  url: SITE_URL,
  logo: abs('/images/hat-green-front.jpeg'),
  description:
    'Smelt makes 100% merino wool felt sauna hats — embroidered, never printed. Made in Cape Town.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Cape Town',
    addressCountry: 'ZA',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en-ZA"
      className={`${bricolage.variable} ${space.variable} ${caveat.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};

  ttq.load('DAFEQ6BC77UES974NGD0');
  ttq.page();
  window.dispatchEvent(new Event('tiktok-pixel-ready'));
}(window, document, 'ttq');`}
        </Script>
        <Script id="meta-pixel">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
window.dispatchEvent(new Event('meta-pixel-ready'));`}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c'),
          }}
        />
        <CartProvider>
          <Ticker />
          <Header />
          {children}
          <Footer />
          <CartDrawer />
        </CartProvider>
        <Analytics />
        <SpeedInsights />
        <MetaPageViewTracker />
      </body>
    </html>
  )
}
