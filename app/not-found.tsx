import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-status">
      <p>404 / OUT OF THE STEAM</p>
      <h1>This page has wandered off.</h1>
      <p>Let’s get you back to the hats.</p>
      <Link href="/product">Shop sauna hats →</Link>
    </main>
  );
}
