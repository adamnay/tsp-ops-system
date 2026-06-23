import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TSP Ops System',
  description: 'TSP Talent Operations Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0F1117] text-[#F0F2F8] antialiased">
        {children}
      </body>
    </html>
  )
}
