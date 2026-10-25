import { Link } from "wouter";
import { CircleHelp, ArrowRight } from "lucide-react";
export default function NotFound() {
  return (
    <section className="panel history-empty">
      <CircleHelp size={28} />
      <div className="eyebrow">PAGE NOT FOUND</div>
      <h1>This path is not in the workspace</h1>
      <p>
        Return to the overview to solve an equation, explore a curve or compare
        observations.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to overview <ArrowRight size={16} />
      </Link>
    </section>
  );
}
