"use client";

import { useMemo } from "react";

type Piece = {
  square: string;
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

const symbols: Record<Piece["type"], string> = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚"
};

export function ChessBoard({
  pieces,
  selectedSquare,
  lastMoveSquare,
  recentMoveSquare,
  onSquareClick,
  interactive,
  orientation = "white"
}: {
  pieces: Piece[];
  selectedSquare: string | null;
  lastMoveSquare?: string | null;
  recentMoveSquare?: string | null;
  onSquareClick: (square: string) => void;
  interactive: boolean;
  orientation?: "white" | "black";
}) {
  const map = useMemo(() => {
    const m = new Map<string, Piece>();
    for (const p of pieces) m.set(p.square, p);
    return m;
  }, [pieces]);

  const files =
    orientation === "white"
      ? ["a", "b", "c", "d", "e", "f", "g", "h"]
      : ["h", "g", "f", "e", "d", "c", "b", "a"];
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="board">
      {ranks.map((rank, rankIdx) =>
        files.map((file, fileIdx) => {
          const square = `${file}${rank}`;
          const piece = map.get(square);
          const fileCode = file.charCodeAt(0) - "a".charCodeAt(0);
          const isLight = (fileCode + rank) % 2 === 0;

          return (
            <button
              key={square}
              type="button"
              disabled={!interactive}
              onClick={() => onSquareClick(square)}
              className={`square ${isLight ? "light" : "dark"} ${
                selectedSquare === square ? "selected" : ""
              } ${lastMoveSquare === square ? "last-move" : ""} ${
                recentMoveSquare === square ? "last-move-recent" : ""
              }`}
              title={square}
            >
              {fileIdx === 0 ? (
                <span className={`coord coord-rank ${isLight ? "coord-on-light" : "coord-on-dark"}`}>
                  {rank}
                </span>
              ) : null}
              {rankIdx === 7 ? (
                <span className={`coord coord-file ${isLight ? "coord-on-light" : "coord-on-dark"}`}>
                  {file.toUpperCase()}
                </span>
              ) : null}
              {piece ? (
                <span className={`piece piece-${piece.color}`}>{symbols[piece.type]}</span>
              ) : (
                ""
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
