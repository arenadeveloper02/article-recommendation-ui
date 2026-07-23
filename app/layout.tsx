import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Article Recommendation Agent',
  description: 'Turn a target keyword into a writer-ready SEO content brief.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans text-slate-800 antialiased`}>
        {children}
      </body>
    </html>
  );
}
