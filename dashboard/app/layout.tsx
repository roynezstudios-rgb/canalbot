import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = `${origin}/og.png`;

  return {
    title: "CanalBot · Centro editorial",
    description: "Panel local para vincular WhatsApp y administrar campañas, canales y publicaciones de CanalBot.",
    icons: {
      icon: "/canalbot-mascota.png",
      shortcut: "/canalbot-mascota.png",
    },
    openGraph: {
      type: "website",
      locale: "es_MX",
      title: "CanalBot · Centro editorial",
      description: "Publica con ritmo. Sin caos.",
      url: origin,
      images: [{ url: socialImage, width: 1731, height: 909, alt: "CanalBot, centro editorial" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "CanalBot · Centro editorial",
      description: "Publica con ritmo. Sin caos.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
