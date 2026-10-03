'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-page"><h1>We couldn’t load this page</h1><p>Please try again. If this continues, contact your administrator.</p><button className="button primary" onClick={reset}>Try again</button></main>; }
