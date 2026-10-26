import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Новиград — симуляция жизни города | WebGL2",
  description:
    "Вольный город Новиград из Ведьмака 3: процедурный город, тысячи горожан живут полностью на GPU (ping-pong RGBA32F симуляция), цикл дня и ночи, порт, храм Вечного Огня.",
  keywords: ["Novigrad", "Ведьмак", "WebGL2", "GPU simulation", "The Witcher 3"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0d0a07",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Alegreya+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#0d0a07] text-foreground overflow-hidden">
        {children}
      </body>
    </html>
  );
}
