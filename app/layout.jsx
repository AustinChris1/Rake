import { Unbounded, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-unbounded',
});
const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
});

export const metadata = {
  title: 'RAKE — who got paid on this candle',
  description:
    'Paste a Base token. RAKE reconstructs the real swaps, names who got paid, and prints the receipt.',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${plex.variable}`}>
      <body className="bg-noir-950 font-mono text-[15px] leading-relaxed text-cream antialiased">
        {children}
      </body>
    </html>
  );
}
