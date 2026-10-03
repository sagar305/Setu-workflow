import "./allocations.css";
import type { Metadata } from 'next';
import './globals.css';
import './workflows.css';
export const metadata: Metadata = { title: { default: 'Setu Workflow', template: '%s · Setu Workflow' }, description: 'A secure workspace for your accounting firm.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
