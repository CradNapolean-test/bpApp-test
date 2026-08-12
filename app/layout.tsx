import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "./_components/ToastProvider";
import { ConfirmProvider } from "./_components/ConfirmDialog";
import { ThemeSync } from "./_components/ThemeSync";
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
    var pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let themePreference: ThemePreference = 'system';
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
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
