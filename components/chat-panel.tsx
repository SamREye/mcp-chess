"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

import { Avatar } from "@/components/avatar";

type Message = {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

export function ChatPanel({
  messages,
  currentUserId,
  canSend,
  onSend
}: {
  messages: Message[];
  currentUserId: string | null;
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

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (sending || !body.trim()) return;
    void submit();
  }

  return (
    <section className="panel chat-panel">
      <h3 style={{ margin: 0 }}>Game Chat</h3>
      <div className="chat-box">
        {messages.length === 0 ? (
          <p className="muted">No chat messages yet.</p>
        ) : (
          messages.map((msg) => {
            const timestamp = new Date(msg.createdAt).toLocaleString();
            const isSelf = Boolean(currentUserId && msg.user.id === currentUserId);
            const fallback = (msg.user.name?.trim()?.[0] ?? msg.user.email?.trim()?.[0] ?? "?")
              .toUpperCase();
            const title = msg.user.email ?? msg.user.name ?? "Player";
            return (
              <div
                key={msg.id}
                className={`chat-msg ${isSelf ? "chat-msg-self" : "chat-msg-other"}`}
                title={timestamp}
              >
                <Avatar
                  email={msg.user.email}
                  name={msg.user.name}
                  image={msg.user.image}
                  fallback={fallback}
                  title={title}
                  className="chat-player-avatar"
                />
                <div className="chat-msg-content">
                  <p style={{ margin: "0.2rem 0" }}>{msg.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canSend ? (
        <div className="row chat-compose">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleInputKeyDown}
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
