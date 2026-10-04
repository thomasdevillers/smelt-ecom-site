'use client'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { CartProvider } from '@/lib/cart'
import Ticker from '@/components/Ticker'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CartDrawer from '@/components/CartDrawer'
import MetaPageViewTracker from '@/components/MetaPageViewTracker'
import { META_PIXEL_ID } from '@/lib/meta'

export default function SiteChrome({ children, structuredData }: { children: React.ReactNode; structuredData: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <>{children}</>;
  // Review invitation paths contain a private, single-use token. Keep the
  // familiar store chrome, but never expose that URL to analytics providers.
  if (pathname.startsWith('/review/') || pathname.startsWith('/checkout/recover/') || pathname.startsWith('/checkout/offer/') || pathname.startsWith('/email/unsubscribe/')) return <CartProvider>
    <Ticker />
    <Header />
    {children}
    <Footer />
    <CartDrawer />
  </CartProvider>;
  return <>
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
        {structuredData}
        <Analytics />
        <CartProvider>
          <Ticker />
          <Header />
          {children}
          <Footer />
          <CartDrawer />
        </CartProvider>
        <SpeedInsights />
        <MetaPageViewTracker />
  </>;
}
