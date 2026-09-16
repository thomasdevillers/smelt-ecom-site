import type { Metadata } from 'next'
import { Bricolage_Grotesque, Space_Grotesk, Caveat } from 'next/font/google'
import SiteChrome from '@/components/SiteChrome'
import './globals.css'
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
    'Smelt makes 100% wool felt sauna hats. Embroidered, not printed. Two colourways, in stock and shipping nationwide from Cape Town.',
  applicationName: 'Smelt',
  keywords: [
    'sauna hat',
    'wool felt sauna hat',
    'wool sauna hat',
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
    'Smelt makes 100% wool felt sauna hats — embroidered, never printed. Made in Cape Town.',
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
        <SiteChrome structuredData={<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c') }} />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
