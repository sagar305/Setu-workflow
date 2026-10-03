import Link from 'next/link';
export default function NotFound() { return <main className="error-page"><h1>Page not found</h1><Link href="/dashboard">Return to your workspace</Link></main>; }
