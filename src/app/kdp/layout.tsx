import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KDP アップロードダッシュボード',
  description: 'Amazon KDP への電子書籍アップロードを管理するダッシュボード',
};

export default function KdpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
