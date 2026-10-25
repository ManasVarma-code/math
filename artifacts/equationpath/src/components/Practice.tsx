import { useRef, useState } from "react";
import {
  useCheckEquation,
  useSolveEquation,
} from "@workspace/api-client-react";
import equations from "../../datasets/practice.json";
import MathView from "./MathView";
import { equationPreview } from "@/lib/math-display";

const pick = (previous = -1) => {
  const choices = equations.map((_, i) => i).filter((i) => i !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
};

export default function Practice() {
  const [index, setIndex] = useState(() => pick());
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [error, setError] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const active = useRef(false);
  const check = useCheckEquation();
  const solve = useSolveEquation();
  const equation = equations[index];
  const pending = check.isPending || solve.isPending;
  async function submit(choice: boolean) {
    if (active.current || feedback) return;
    active.current = true;
    setAnswer(choice);
    setError("");
    try {
      const data = { m: equation.m, n: equation.n };
      const analysis = await check.mutateAsync({ data });
      const solution = await solve.mutateAsync({ data });
      // Curated labels are test metadata only; answers and score use the real engine.
      setFeedback({ analysis, solution });
      setScore((s) => ({
        correct: s.correct + Number(choice === analysis.is_exact),
        total: s.total + 1,
      }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The math engine could not check this equation. Retry your choice.",
      );
    } finally {
      active.current = false;
    }
  }
  function next() {
    setIndex(pick(index));
    setAnswer(null);
    setFeedback(null);
    setError("");
  }
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNIT IV / PRACTICE</div>
          <h1>Practice mode</h1>
          <p>
            Decide whether the equation is exact before revealing the engine's
            computation.
          </p>
        </div>
        <span className="mode-chip" aria-label="Practice score">
          Score: {score.correct} / {score.total}
        </span>
      </div>
      <section className="panel">
        <h3>Exact or non-exact?</h3>
        <MathView latex={equationPreview(equation.m, equation.n) || ""} block />
        {!feedback && (
          <div className="equation-actions">
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() => void submit(true)}
            >
              Exact
            </button>
            <button
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => void submit(false)}
            >
              Non-exact
            </button>
          </div>
        )}
        {pending && (
          <p role="status">
            Checking derivatives and computing the supported derivation…
          </p>
        )}
        {error && (
          <p className="notice-line" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <div data-testid="practice-feedback">
            <p className="notice-line">
              {answer === feedback.analysis.is_exact
                ? "Correct."
                : "Not quite."}{" "}
              {feedback.analysis.is_exact
                ? "Equal → Exact"
                : "Not equal → Non-exact"}
            </p>
            <div className="derivative-grid">
              <div className="derivative-cell">
                <span>∂M/∂y</span>
                <MathView latex={feedback.analysis.m_y_latex} />
              </div>
              <span>≟</span>
              <div className="derivative-cell">
                <span>∂N/∂x</span>
                <MathView latex={feedback.analysis.n_x_latex} />
              </div>
              <div>
                <small>Mᵧ − Nₓ</small>
                <p>{feedback.analysis.difference}</p>
              </div>
            </div>
            <p>{feedback.analysis.explanation}</p>
            {feedback.solution.integrating_factor_latex && (
              <div className="potential-result">
                <small>INTEGRATING FACTOR</small>
                <MathView
                  latex={`\\mu = ${feedback.solution.integrating_factor_latex}`}
                  block
                />
              </div>
            )}
            {feedback.solution.steps_latex?.length ? (
              <ol className="steps-list">
                {feedback.solution.steps_latex.map(
                  (step: string, i: number) => (
                    <li key={i}>
                      <span>{i + 1}</span>
                      <div>
                        <p>{feedback.solution.step_descriptions?.[i]}</p>
                        <MathView latex={step} block />
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className="notice-line">
                {feedback.solution.steps?.join(" ")}
              </p>
            )}
            {feedback.solution.domain_restrictions.map(
              (restriction: string, i: number) => (
                <p key={i} className="notice-line">
                  {restriction}
                </p>
              ),
            )}
            <button className="btn btn-primary" onClick={next}>
              Next equation
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
