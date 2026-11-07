import "./allocations.css";
import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';
import './workflows.css';
export const metadata: Metadata = { title: { default: 'Setu Workflow', template: '%s · Setu Workflow' }, description: 'A secure workspace for your accounting firm.', robots: { index: false, follow: false } };
// Setu's brand typeface, as on setutechnology.com.
const sora = Sora({ subsets: ['latin'], display: 'swap', variable: '--font-sora' });
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={sora.variable}><body>{children}</body></html>; }
