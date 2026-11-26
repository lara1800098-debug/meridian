export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div data-print className="bg-white">{children}</div>;
}
