import './globals.css';
import { Sidebar } from '../components/Sidebar';

export const metadata = {
  title: 'SMS Gateway Platform Dashboard',
  description: 'Self-hosted Bridge-inspired SMS Gateway Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-900 min-h-screen p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
