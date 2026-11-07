import { notFound } from "next/navigation";
import { isPlatformRoute } from "@/lib/platform";
import "../../platform.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setu owner console", robots: { index: false, follow: false } };

export default async function ConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ secret: string }>;
}) {
  if (!isPlatformRoute((await params).secret)) notFound();
  return <div className="console">{children}</div>;
}
