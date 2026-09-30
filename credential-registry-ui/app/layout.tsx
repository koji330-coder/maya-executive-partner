import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const description = "開発プロジェクトと認証情報のつながりを、秘密値を持たずに確認する管理画面。";
  return {
    title: "Credential Registry",
    description,
    openGraph: { title: "Credential Registry", description, images: [{ url: image, width: 1744, height: 907 }] },
    twitter: { card: "summary_large_image", title: "Credential Registry", description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
