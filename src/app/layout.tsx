import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TDConsulting AI - Trợ lý Sổ Tay Nhân Viên',
  description:
    'Chatbot AI hỗ trợ nhân viên TDConsulting tra cứu chính sách, quy định và nội quy công ty từ Sổ Tay Nhân Viên.',
  keywords: 'TDConsulting, chatbot, sổ tay nhân viên, HR, chính sách',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning>{children}</body>
    </html>
  );
}
