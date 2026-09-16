import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";
export const metadata: Metadata = {
  title: "Orders · Admin", robots: { index: false, follow: false }, alternates: { canonical: "/admin" },
};
export default function AdminPage() { return <AdminDashboard />; }
