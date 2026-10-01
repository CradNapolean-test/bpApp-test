import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "./_components/ToastProvider";
import { ConfirmProvider } from "./_components/ConfirmDialog";
import { ThemeSync } from "./_components/ThemeSync";
import { ServiceWorkerRegister } from "./_components/ServiceWorkerRegister";
import { SplashScreen } from "./_components/SplashScreen";
import { OfflineBanner } from "./_components/OfflineBanner";
import { createClient } from "@/lib/supabase/server";
import type { ThemePreference } from "./_components/theme";

// Runs before hydration, before any stylesheet paint -- reads the locally-cached preference
// and applies the .dark class synchronously so there's no flash of the wrong theme. Can't
// import theme.ts's resolveEffectiveTheme/readStoredTheme here (this has to be a standalone
// string with zero dependencies), so the same small bit of logic is deliberately duplicated.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    var effective = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    document.documentElement.classList.toggle('dark', effective === 'dark');
  } catch (e) {}
})();
`;

const inter = Inter({
  variable: "--font-geist-sans",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ballistic Performance",
  description: "Coaching platform",
  manifest: "/manifest.json",
  applicationName: "Ballistic",
  // iPhone home-screen app: full screen, own title, black status bar (matches the dark app).
  appleWebApp: {
    capable: true,
    title: "Ballistic",
    statusBarStyle: "black",
    // Launch image per iPhone size, so opening from the home screen shows the logo on black
    // instead of a white flash.
    startupImage: [
      { url: "/splash/1320x2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1206x2622.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1125x2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/1242x2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/1242x2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Browser/Android toolbar colour follows the OS theme; content extends under the notch and home
  // indicator (viewport-fit=cover) and the layout pads itself with the safe-area insets.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let themePreference: ThemePreference = 'dark';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('theme_preference')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.theme_preference) themePreference = profile.theme_preference as ThemePreference;
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <ConfirmProvider>
            <ThemeSync dbPreference={themePreference} />
            <ServiceWorkerRegister />
            <SplashScreen />
            <OfflineBanner />
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
