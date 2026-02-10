"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

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

export type ChessBoardAnimation = {
  key: number;
  mover: {
    from: string;
    to: string;
    piece: Pick<Piece, "type" | "color">;
  };
  captured?: {
    square: string;
    piece: Pick<Piece, "type" | "color">;
  };
};

function getSquarePosition(square: string, orientation: "white" | "black") {
  const file = square[0];
  const rank = Number(square[1]);
  const fileIndex = file.charCodeAt(0) - "a".charCodeAt(0);

  if (orientation === "white") {
    return { x: fileIndex, y: 8 - rank };
  }

  return { x: 7 - fileIndex, y: rank - 1 };
}

export function ChessBoard({
  pieces,
  selectedSquare,
  lastMoveSquare,
  recentMoveSquare,
  animation,
  onSquareClick,
  interactive,
  orientation = "white"
}: {
  pieces: Piece[];
  selectedSquare: string | null;
  lastMoveSquare?: string | null;
  recentMoveSquare?: string | null;
  animation?: ChessBoardAnimation | null;
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
  const hiddenSquares = useMemo(() => {
    const hidden = new Set<string>();
    if (!animation) return hidden;
    hidden.add(animation.mover.from);
    if (animation.captured) hidden.add(animation.captured.square);
    return hidden;
  }, [animation]);

  const moverFromPos = animation
    ? getSquarePosition(animation.mover.from, orientation)
    : null;
  const moverToPos = animation ? getSquarePosition(animation.mover.to, orientation) : null;
  const capturedPos = animation?.captured
    ? getSquarePosition(animation.captured.square, orientation)
    : null;

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
              {piece && !hiddenSquares.has(square) ? (
                <span className={`piece piece-${piece.color}`}>{symbols[piece.type]}</span>
              ) : (
                ""
              )}
            </button>
          );
        })
      )}
      {animation && moverFromPos && moverToPos ? (
        <div className="board-animation-layer" aria-hidden="true">
          <span
            key={`m-${animation.key}`}
            className={`piece piece-${animation.mover.piece.color} anim-piece anim-piece-move`}
            style={
              {
                left: `${(moverFromPos.x / 8) * 100}%`,
                top: `${(moverFromPos.y / 8) * 100}%`,
                "--tx": `${(moverToPos.x - moverFromPos.x) * 100}%`,
                "--ty": `${(moverToPos.y - moverFromPos.y) * 100}%`
              } as CSSProperties
            }
          >
            {symbols[animation.mover.piece.type]}
          </span>
          {animation.captured && capturedPos ? (
            <span
              key={`c-${animation.key}`}
              className={`piece piece-${animation.captured.piece.color} anim-piece anim-piece-captured`}
              style={
                {
                  left: `${(capturedPos.x / 8) * 100}%`,
                  top: `${(capturedPos.y / 8) * 100}%`
                } as CSSProperties
              }
            >
              {symbols[animation.captured.piece.type]}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
