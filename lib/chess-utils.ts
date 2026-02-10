import { Chess } from "chess.js";

const pieceToUnicode: Record<string, string> = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔"
};

export type PieceStatus = {
  square: string;
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

export function getPiecesFromFen(fen: string): PieceStatus[] {
  const chess = new Chess(fen);
  const board = chess.board();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const pieces: PieceStatus[] = [];

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rank = 8 - rankIndex;
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const piece = board[rankIndex]?.[fileIndex];
      if (!piece) continue;
      pieces.push({
        square: `${files[fileIndex]}${rank}`,
        type: piece.type,
        color: piece.color
      });
    }
  }

  return pieces;
}

export function renderBoardSvg(fen: string, size = 560): string {
  const chess = new Chess(fen);
  const board = chess.board();
  const square = size / 8;
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  let out = "";

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rank = 8 - rankIndex;
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const x = fileIndex * square;
      const y = rankIndex * square;
      const light = (rankIndex + fileIndex) % 2 === 0;
      const fill = light ? "#f0d9b5" : "#b58863";
      out += `<rect x='${x}' y='${y}' width='${square}' height='${square}' fill='${fill}' />`;
      const coordColor = light ? "#b58863" : "#f0d9b5";
      if (fileIndex === 0) {
        out += `<text x='${x + square * 0.08}' y='${y + square * 0.2}' font-size='${square * 0.2}' font-family='\"Arial\", sans-serif' font-weight='700' fill='${coordColor}'>${rank}</text>`;
      }
      if (rankIndex === 7) {
        out += `<text x='${x + square * 0.9}' y='${y + square * 0.92}' text-anchor='end' font-size='${square * 0.2}' font-family='\"Arial\", sans-serif' font-weight='700' fill='${coordColor}'>${files[fileIndex].toUpperCase()}</text>`;
      }

      const piece = board[rankIndex]?.[fileIndex];
      if (!piece) continue;

      const key = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
      const symbol = pieceToUnicode[key];
      const label = `${files[fileIndex]}${rank}`;
      const pieceFill = piece.color === "w" ? "#fffdf8" : "#111111";
      const pieceStroke = piece.color === "w" ? "#4b3a2a" : "#000000";

      out += `<text x='${x + square / 2}' y='${y + square * 0.66}' text-anchor='middle' font-size='${square * 0.72}' font-family='\"Times New Roman\", serif' fill='${pieceFill}' stroke='${pieceStroke}' stroke-width='${square * 0.03}' paint-order='stroke fill'>${symbol}</text>`;
      out += `<title>${label}</title>`;
    }
  }

  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${out}</svg>`;
}
