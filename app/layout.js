import "./globals.css";

export const metadata = {
  title: "GHL Agent Hub",
  description: "Next.js full-stack interface for GHL agents",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
