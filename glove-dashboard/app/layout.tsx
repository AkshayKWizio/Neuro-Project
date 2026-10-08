import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './redesign.css';
import './clinical.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Neuro — Glove Based Rehabilitation',
  description: 'Local real-time glove rehabilitation and exercise tracking.',
  openGraph: { title: 'Neuro', description: 'Glove based rehabilitation', images: ['/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Neuro', description: 'Glove based rehabilitation', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
