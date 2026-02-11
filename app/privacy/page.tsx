export default function PrivacyPolicyPage() {
  return (
    <section className="panel legal-page">
      <h2>Privacy Policy</h2>
      <p className="muted">Last updated: February 11, 2026</p>

      <p>
        MCP Chess stores account data needed for authentication and gameplay, including email,
        display name, profile image, game actions, and chat messages.
      </p>
      <p>
        Games are public by design. Game metadata, board state, and move history are visible to
        other users. Only authenticated game players can submit moves or chat messages.
      </p>
      <p>
        OAuth is used for MCP tool access. Access tokens are stored to authorize requests and can
        be invalidated by disconnecting the app from your MCP client.
      </p>
      <p>
        Operational logs may be retained for reliability, abuse prevention, and security
        diagnostics.
      </p>
      <p>
        Contact:{" "}
        <a href="mailto:sam@directeddomains.com" className="text-link">
          sam@directeddomains.com
        </a>
      </p>
    </section>
  );
}
