import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

export default function MathView({
  latex,
  block = false,
}: {
  latex: string;
  block?: boolean;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        displayMode: block,
        throwOnError: false,
        trust: false,
        strict: "ignore",
        output: "htmlAndMathml",
      }),
    [latex, block],
  );
  return (
    <span
      className={`math-view ${block ? "math-block" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
