import { Chess } from "chess.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getChessPieceAssetPath } from "@/lib/chess-piece-assets";

export type PieceStatus = {
  square: string;
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

const pieceDataUriCache = new Map<string, string>();

function getEmbeddedPieceDataUri(color: PieceStatus["color"], type: PieceStatus["type"]) {
  const cacheKey = `${color}-${type}`;
  const cached = pieceDataUriCache.get(cacheKey);
  if (cached) return cached;

  const publicAssetPath = getChessPieceAssetPath(color, type).replace(/^\//, "");
  const filePath = path.join(process.cwd(), "public", publicAssetPath);
  const source = readFileSync(filePath, "utf8");
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
  pieceDataUriCache.set(cacheKey, dataUri);
  return dataUri;
}

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

      const label = `${files[fileIndex]}${rank}`;
      const imagePath = getEmbeddedPieceDataUri(piece.color, piece.type);
      const imageSize = square * 0.82;
      const imageOffset = (square - imageSize) / 2;

      out += `<g><title>${label}</title><image x='${x + imageOffset}' y='${y + imageOffset}' width='${imageSize}' height='${imageSize}' href='${imagePath}' preserveAspectRatio='xMidYMid meet' /></g>`;
    }
  }

  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${out}</svg>`;
}
