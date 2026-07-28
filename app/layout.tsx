import { getArenaEmailId } from '@/lib/arena-email'
import { ArenaEmailProvider } from '@/components/arena-email-provider'
import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'Article Recommendation Agent',
  description: 'Turn a target keyword and client into writer-ready article recommendations.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const emailId = await getArenaEmailId()

  return (
    <html lang="en">
      <body className={`${poppins.variable} ${poppins.className} font-sans text-ink antialiased`}>
        <ArenaEmailProvider emailId={emailId}>{children}</ArenaEmailProvider>
      </body>
    </html>
  );
}
