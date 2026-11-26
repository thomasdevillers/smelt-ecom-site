import { CartProvider } from "@/lib/cart";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Ticker from "@/components/Ticker";
import CartDrawer from "@/components/CartDrawer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Ticker />
      <Header />
      {children}
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
