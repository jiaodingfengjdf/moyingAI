import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '墨影 AI · 智能小说创作工作台',
  description: '墨影 AI (InkPulse AI) 智能小说创作工作台',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
