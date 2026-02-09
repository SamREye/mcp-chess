"use client";

import { useState } from "react";

type Message = {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    email: string | null;
  };
};

export function ChatPanel({
  messages,
  canSend,
  onSend
}: {
  messages: Message[];
  canSend: boolean;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await onSend(body.trim());
      setBody("");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel stack">
      <h3 style={{ margin: 0 }}>Game Chat</h3>
      <div className="chat-box">
        {messages.length === 0 ? (
          <p className="muted">No chat messages yet.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-msg">
              <strong>{msg.user.email ?? msg.user.id}</strong>
              <p style={{ margin: "0.2rem 0" }}>{msg.body}</p>
              <p className="muted">{new Date(msg.createdAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>

      {canSend ? (
        <div className="row">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="primary"
            disabled={sending || !body.trim()}
            onClick={() => void submit()}
          >
            Send
          </button>
        </div>
      ) : (
        <p className="muted">Only authenticated players can post to chat.</p>
      )}
    </section>
  );
}
