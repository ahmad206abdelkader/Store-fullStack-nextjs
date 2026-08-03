import { ModalProvider } from "@/Providers/modal-provider";
import { ToastProvider } from "@/Providers/toast-provider";

import "./globals.css";
import { ThemeProvider } from "@/Providers/theme-provider";

export const metadata = {
  title: "Admin Dashboard",
  description: "Admin dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <link rel="icon" href="/vercel.png" sizes="any" />
        <body className="font-sans">
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <ToastProvider />
            <ModalProvider />
            {children}
          </ThemeProvider>
        </body>
    </html>
  );
}
