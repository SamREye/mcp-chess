import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p className="site-footer-copy">© {year} MCP Chess</p>
      <div className="site-footer-links">
        <Link href="/privacy" className="site-footer-link">
          Privacy Policy
        </Link>
        <Link href="/terms" className="site-footer-link">
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
