import { Public_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import { ThemeProvider } from '@/components/app/theme-provider';
import { cn } from '@/lib/shadcn/utils';
import '@/styles/globals.css';

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

const commitMono = localFont({
  display: 'swap',
  variable: '--font-commit-mono',
  src: [
    { path: '../fonts/CommitMono-400-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/CommitMono-700-Regular.otf', weight: '700', style: 'normal' },
    { path: '../fonts/CommitMono-400-Italic.otf', weight: '400', style: 'italic' },
    { path: '../fonts/CommitMono-700-Italic.otf', weight: '700', style: 'italic' },
  ],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(publicSans.variable, commitMono.variable, 'dark scroll-smooth font-sans antialiased')}
      suppressHydrationWarning
    >
      <head>
        <title>Product Talk</title>
        <meta
          name="description"
          content="Scan a supermarket product and talk to it about the pack facts."
        />
      </head>
      <body className="overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
