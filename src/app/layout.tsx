import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "团队协同智能体",
  description: "Team Coordinator Agent - 团队协作智能助手",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-screen">
      <body className="h-screen flex flex-col antialiased">{children}</body>
    </html>
  )
}
