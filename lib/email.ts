import nodemailer from "nodemailer";

type MailResult = {
  sent: boolean;
  skippedReason?: string;
  error?: string;
  messageId?: string;
};

type GameInviteEmailArgs = {
  toEmail: string;
  invitedByEmail: string | null;
  invitedByName: string | null;
  gameId: string;
  opponentExists: boolean;
};

type TurnReminderEmailArgs = {
  toEmail: string;
  gameId: string;
  minutesSinceLastMove: number;
  minMinutesSinceLastMove: number;
};

let transporterCache: nodemailer.Transporter | null = null;

function getAppUrl() {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getFromEmail() {
  return process.env.SMTP_FROM || "no-reply@localhost";
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporterCache) {
    return transporterCache;
  }

  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !portRaw || !user || !pass) {
    return null;
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port)) {
    return null;
  }

  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return transporterCache;
}

async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      sent: false,
      skippedReason: "SMTP not configured"
    };
  }

  try {
    const info = await transporter.sendMail({
      from: getFromEmail(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });

    return {
      sent: true,
      messageId: info.messageId
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "SMTP send failed"
    };
  }
}

export async function sendGameInvitationEmail(
  args: GameInviteEmailArgs
): Promise<MailResult> {
  const gameUrl = `${getAppUrl()}/games/${args.gameId}`;
  const inviter = args.invitedByName || args.invitedByEmail || "A player";
  const registrationNote = args.opponentExists
    ? "Your opponent started a game with you."
    : "Your opponent started a game with you. This email is not registered yet, but you can sign in with Google using this email to play.";

  return sendMail({
    to: args.toEmail,
    subject: "You were invited to a chess game",
    text: `${inviter} invited you to a chess game.\n\n${registrationNote}\n\nOpen game: ${gameUrl}`,
    html: `<p><strong>${escapeHtml(inviter)}</strong> invited you to a chess game.</p><p>${escapeHtml(
      registrationNote
    )}</p><p><a href=\"${escapeHtml(gameUrl)}\">Open game</a></p>`
  });
}

export async function sendTurnReminderEmail(
  args: TurnReminderEmailArgs
): Promise<MailResult> {
  const gameUrl = `${getAppUrl()}/games/${args.gameId}`;

  return sendMail({
    to: args.toEmail,
    subject: "Chess reminder: it's your move",
    text: `It's your turn to move in game ${args.gameId}.\n\nLast move was ${Math.floor(
      args.minutesSinceLastMove
    )} minute(s) ago (threshold: ${args.minMinutesSinceLastMove} minute(s)).\n\nOpen game: ${gameUrl}`,
    html: `<p>It's your turn to move in game <code>${escapeHtml(args.gameId)}</code>.</p><p>Last move was ${Math.floor(
      args.minutesSinceLastMove
    )} minute(s) ago (threshold: ${args.minMinutesSinceLastMove} minute(s)).</p><p><a href=\"${escapeHtml(
      gameUrl
    )}\">Open game</a></p>`
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
