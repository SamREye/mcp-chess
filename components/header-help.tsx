"use client";

import { useEffect, useMemo, useState } from "react";

type HelpView = "overview" | "chatgpt" | "claude";

const fallbackMcpUrl = "https://your-domain.com/api/mcp";

export function HeaderHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<HelpView>("overview");
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const mcpUrl = useMemo(() => {
    if (!origin) return fallbackMcpUrl;
    return `${origin}/api/mcp`;
  }, [origin]);

  function openModal() {
    setView("overview");
    setIsOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="topbar-help-btn"
        onClick={openModal}
        aria-label="About MCP Chess"
        title="About MCP Chess"
      >
        ?
      </button>

      {isOpen && (
        <div className="modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="panel help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-head">
              {view === "overview" ? (
                <h2 style={{ margin: 0 }}>About MCP Chess</h2>
              ) : (
                <button type="button" className="help-back-btn" onClick={() => setView("overview")}>
                  ← Back
                </button>
              )}
              <button type="button" className="new-game-close" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            {view === "overview" && (
              <div className="help-body">
                <p>
                  MCP Chess is a fully fledged chess game with matchmaking, board play, and chat.
                </p>
                <p>But there's more to it!</p>
                <p>
                  Its special purpose is demonstrating MCP: an LLM can control the game on your
                  behalf (for example in ChatGPT or Claude).
                </p>
                <div className="help-actions">
                  <button type="button" className="primary" onClick={() => setView("chatgpt")}>
                    How to connect it to ChatGPT
                  </button>
                  <button type="button" className="primary" onClick={() => setView("claude")}>
                    How to connect it to Claude
                  </button>
                </div>
              </div>
            )}

            {view === "chatgpt" && (
              <div className="help-body">
                <h3>Connect to ChatGPT</h3>
                <p>
                  To connect MCP Chess to ChatGPT, you'll need to add it as a custom app in Developer mode since it is in Beta mode.
                </p>
                <ol className="help-steps">
                  <li>Click on your user profile, open Settings and locate the Apps section.</li>
                  <li>In Advanced Settings: enable Developer mode if it's not already enabled.</li>
                  <li>Click on "Create app".</li>
                  <li>Give it the name 'MCP Chess' and set the server URL to <code>{mcpUrl}</code>.</li>
                  <li>Save and click Connect.</li>
                  <li>Complete OAuth in the popup and approve access.</li>
                  <li>Return to chat and call MCP Chess tools (for example: list games, move).</li>
                </ol>
              </div>
            )}

            {view === "claude" && (
              <div className="help-body">
                <h3>Connect to Claude</h3>
                <ol className="help-steps">
                  <li>Open Claude integrations/tools settings and add an MCP server.</li>
                  <li>Set the server URL to <code>{mcpUrl}</code>.</li>
                  <li>Authorize with OAuth when prompted.</li>
                  <li>Enable the MCP Chess tools for your conversation.</li>
                  <li>Use Claude to query status/history or submit moves through the tools.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
