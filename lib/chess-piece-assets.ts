export type ChessPieceType = "p" | "r" | "n" | "b" | "q" | "k";
export type ChessPieceColor = "w" | "b";

const PIECE_FILE_BY_COLOR: Record<ChessPieceColor, Record<ChessPieceType, string>> = {
  w: {
    p: "white-pawn.svg",
    r: "white-rook.svg",
    n: "white-knight.svg",
    b: "white-bishop.svg",
    q: "white-queen.svg",
    k: "white-king.svg"
  },
  b: {
    p: "black-pawn.svg",
    r: "black-rook.svg",
    n: "black-knight.svg",
    b: "black-bishop.svg",
    q: "black-queen.svg",
    k: "black-king.svg"
  }
};

const PIECE_LABEL_BY_TYPE: Record<ChessPieceType, string> = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king"
};

export function getChessPieceAssetPath(color: ChessPieceColor, type: ChessPieceType): string {
  return `/chess-pieces/${PIECE_FILE_BY_COLOR[color][type]}`;
}

export function getChessPieceLabel(color: ChessPieceColor, type: ChessPieceType): string {
  const colorLabel = color === "w" ? "White" : "Black";
  return `${colorLabel} ${PIECE_LABEL_BY_TYPE[type]}`;
}
