import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Token-bearing routes deliberately have no analytics or attribution components. */
export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
