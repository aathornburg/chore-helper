import { useCallback, useLayoutEffect, useRef, useState } from "react";

type LandingPageProps = {
  primaryAction: React.ReactNode;
  signInAction: React.ReactNode;
};

type MarkerRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

type MarkerGeometryInput = {
  layer: MarkerRect;
  source: MarkerRect;
  target: MarkerRect;
};

type MarkerGeometry = {
  arrowHead: {
    path: string;
    x: number;
    y: number;
  };
  path: string;
  pulse: {
    cx: number;
    cy: number;
    r: number;
  };
  ring: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  };
  viewBox: string;
};

function round(value: number) {
  return Math.round(value);
}

function floor(value: number) {
  return Math.floor(value);
}

function calculateArrowHeadPath(tip: { x: number; y: number }, control: { x: number; y: number }) {
  const length = 15;
  const spread = 8;
  const dx = tip.x - control.x;
  const dy = tip.y - control.y;
  const distance = Math.hypot(dx, dy) || 1;
  const unit = {
    x: dx / distance,
    y: dy / distance
  };
  const normal = {
    x: -unit.y,
    y: unit.x
  };
  const base = {
    x: tip.x - unit.x * length,
    y: tip.y - unit.y * length
  };
  const firstLeg = {
    x: round(base.x + normal.x * spread),
    y: round(base.y + normal.y * spread)
  };
  const secondLeg = {
    x: round(base.x - normal.x * spread),
    y: round(base.y - normal.y * spread)
  };

  return `M ${firstLeg.x} ${firstLeg.y} L ${tip.x} ${tip.y} L ${secondLeg.x} ${secondLeg.y}`;
}

export function calculateCalendarMarkerGeometry({
  layer,
  source,
  target
}: MarkerGeometryInput): MarkerGeometry {
  const sourceCenter = {
    x: round(source.left - layer.left + source.width / 2),
    y: round(source.top - layer.top + source.height / 2)
  };
  const sourceAnchor = {
    x: round(sourceCenter.x - Math.min(18, source.width * 0.08)),
    y: round(sourceCenter.y + Math.min(8, source.height * 0.14))
  };
  const targetCenter = {
    x: round(target.left - layer.left + target.width / 2),
    y: round(target.top - layer.top + target.height / 2)
  };
  const ring = {
    cx: targetCenter.x,
    cy: targetCenter.y,
    rx: floor(Math.min(Math.max(target.width * 0.42, 48), layer.width * 0.34)),
    ry: floor(Math.min(Math.max(target.height * 0.6, 28), layer.height * 0.13))
  };
  const arrowEnd = {
    x: round(targetCenter.x - Math.min(48, ring.rx * 0.42)),
    y: round(targetCenter.y - ring.ry * 0.82)
  };
  const horizontalSweep = Math.max(52, Math.min(72, layer.width * 0.207));
  const secondControlInset = Math.max(18, Math.min(28, layer.width * 0.065));
  const isSameRow = Math.abs(arrowEnd.y - sourceAnchor.y) < 80;
  const firstControl = isSameRow
    ? {
        x: round(sourceAnchor.x + (arrowEnd.x - sourceAnchor.x) * 0.35),
        y: round(Math.min(sourceAnchor.y, arrowEnd.y) - Math.min(44, Math.max(30, layer.height * 0.205)))
      }
    : {
        x: round(sourceAnchor.x - horizontalSweep),
        y: round(sourceAnchor.y + (arrowEnd.y - sourceAnchor.y) * 0.19)
      };
  const secondControl = isSameRow
    ? {
        x: round(sourceAnchor.x + (arrowEnd.x - sourceAnchor.x) * 0.65),
        y: firstControl.y
      }
    : {
        x: round(targetCenter.x - horizontalSweep - secondControlInset),
        y: round(sourceAnchor.y + (arrowEnd.y - sourceAnchor.y) * 0.7)
      };
  return {
    arrowHead: {
      path: calculateArrowHeadPath(arrowEnd, secondControl),
      x: arrowEnd.x,
      y: arrowEnd.y
    },
    path: `M ${sourceAnchor.x} ${sourceAnchor.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${arrowEnd.x} ${arrowEnd.y}`,
    pulse: {
      cx: sourceAnchor.x,
      cy: sourceAnchor.y,
      r: 8
    },
    ring,
    viewBox: `0 0 ${round(layer.width)} ${round(layer.height)}`
  };
}

export function LandingPage({ primaryAction, signInAction }: LandingPageProps) {
  const markerLayerRef = useRef<SVGSVGElement>(null);
  const optimizationSourceRef = useRef<HTMLSpanElement>(null);
  const optimizationTargetRef = useRef<HTMLSpanElement>(null);
  const [markerGeometry, setMarkerGeometry] = useState<MarkerGeometry | null>(null);

  const measureMarker = useCallback(() => {
    const markerLayer = markerLayerRef.current;
    const optimizationSource = optimizationSourceRef.current;
    const optimizationTarget = optimizationTargetRef.current;

    if (!markerLayer || !optimizationSource || !optimizationTarget) return;

    setMarkerGeometry(calculateCalendarMarkerGeometry({
      layer: markerLayer.getBoundingClientRect(),
      source: optimizationSource.getBoundingClientRect(),
      target: optimizationTarget.getBoundingClientRect()
    }));
  }, []);

  useLayoutEffect(() => {
    measureMarker();

    const observedElements: Element[] = [
      markerLayerRef.current,
      optimizationSourceRef.current,
      optimizationTargetRef.current
    ].filter((element): element is NonNullable<typeof element> => element !== null);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => measureMarker());

    observedElements.forEach((element) => resizeObserver?.observe(element));
    window.addEventListener("resize", measureMarker);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureMarker);
    };
  }, [measureMarker]);

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a className="landing-brand" href="/" onClick={(event) => event.preventDefault()}>
          <img alt="" aria-hidden="true" className="brand-logo" src="/clenella-logo.svg" />
          Clenella
        </a>
        <div className="landing-nav-links">
          <a href="#how-cleanly-works">How it works</a>
          <a href="#family-load">Family load</a>
          <a href="#why-cleanly">Why Clenella</a>
          <span className="landing-sign-in">{signInAction}</span>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <h1 aria-label="Put chores where the week actually has room.">
            <span>Put chores</span>
            <span>where the week</span>
            <span>actually has room.</span>
          </h1>
          <p className="hero-statement">
            Clenella reads the shape of your week, tracks what got done, and suggests a plan
            that fits calendars, people, properties, and real chore duration.
          </p>
          <p className="lede">
            Connect Google Calendar, keep household routines visible, and spot the
            changes that make chores shorter, better timed, and easier to share.
          </p>
          <div className="hero-actions">
            <span className="landing-primary-action">{primaryAction}</span>
            <a className="landing-secondary-action" href="#how-cleanly-works">
              See the calendar flow
            </a>
          </div>
        </div>

        <div className="calendar-control-preview" aria-label="Clenella calendar optimization preview" role="region">
          <div className="preview-topline">
            <strong>June chore plan</strong>
            <span>Synced with Google Calendar</span>
          </div>
          <div className="preview-sync-banner">
            Google Calendar added: practice, dentist, trash pickup, school event
          </div>
          <div className="preview-week">
            <div className="preview-calendar-grid">
              <div className="preview-day">
                <div className="preview-day-header"><strong>Mon</strong><span>15</span></div>
                <span className="preview-event is-calendar"><strong>Practice 5:30</strong></span>
                <span className="preview-event"><strong>Kitchen reset</strong></span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Tue</strong><span>16</span></div>
                <span className="preview-event is-optimization-source" ref={optimizationSourceRef}>
                  <strong>Bathroom reset</strong>
                  <span className="optimization-x" aria-hidden="true">
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Wed</strong><span>17</span></div>
                <span className="preview-event"><strong>Vacuum main floor</strong><small>30 min</small></span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Thu</strong><span>18</span></div>
                <span className="preview-event is-calendar"><strong>Dentist</strong></span>
                <span className="preview-event" ref={optimizationTargetRef}><strong>Bathroom reset</strong></span>
                <span className="preview-event"><strong>Laundry fold</strong><small>25 min</small></span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Fri</strong><span>19</span></div>
                <span className="preview-event"><strong>Mop floors</strong><small>20 min</small></span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Sat</strong><span>20</span></div>
                <span className="preview-event is-calendar"><strong>Lake house</strong></span>
                <span className="preview-event"><strong>Property check</strong></span>
              </div>
              <div className="preview-day">
                <div className="preview-day-header"><strong>Sun</strong><span>21</span></div>
                <span className="preview-event"><strong>Entry reset</strong></span>
              </div>
            </div>
            <svg
              className="cleanly-marker-layer"
              viewBox={markerGeometry?.viewBox ?? "0 0 1000 300"}
              preserveAspectRatio="none"
              aria-hidden="true"
              ref={markerLayerRef}
            >
              {markerGeometry ? (
                <g className="marker-optimization-layer">
                  <ellipse
                    className="marker-ring marker-green marker-draw delay-three"
                    pathLength="1"
                    cx={markerGeometry.ring.cx}
                    cy={markerGeometry.ring.cy}
                    rx={markerGeometry.ring.rx}
                    ry={markerGeometry.ring.ry}
                  />
                  <path
                    className="marker-line marker-flow marker-draw delay-two"
                    pathLength="1"
                    d={markerGeometry.path}
                  />
                  <path
                    className="marker-arrow-head delay-two"
                    d={markerGeometry.arrowHead.path}
                  />
                  <circle
                    className="marker-pulse delay-two"
                    cx={markerGeometry.pulse.cx}
                    cy={markerGeometry.pulse.cy}
                    r={markerGeometry.pulse.r}
                  />
                </g>
              ) : null}
            </svg>
          </div>
        </div>
      </section>

      <div className="landing-sections">
        <section className="landing-section landing-story-section" id="how-cleanly-works">
          <div className="landing-section-copy">
            <p className="eyebrow">Three steps, no spreadsheet</p>
            <h2>How Clenella works</h2>
            <p className="landing-section-lede">
              Set up the home, connect the calendar, and let Clenella turn chore history into a better week.
            </p>
          </div>
          <div className="landing-story-grid">
            <article className="landing-story-card">
              <span className="story-ribbon">01</span>
              <h3>Set up the home</h3>
              <p>Add rooms, routines, rough durations, and who usually helps so Clenella has the context to plan around.</p>
            </article>
            <article className="landing-story-card is-offset">
              <span className="story-ribbon">02</span>
              <h3>Keep Clenella in the loop</h3>
              <p>Mark chores complete, skipped, or still open so Clenella can learn what actually happened and plan the next week with better timing.</p>
            </article>
            <article className="landing-story-card">
              <span className="story-ribbon">03</span>
              <h3>Let Clenella make it easier</h3>
              <p>Use the suggested shifts to keep chores shorter, better timed, and easier to share.</p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-proof-section" id="family-load">
          <div className="landing-section-copy">
            <p className="eyebrow">Family load</p>
            <h2>Balanced for the household</h2>
            <p className="landing-section-lede">
              Workload is balanced by time and availability, not just chore count, so shared homes and multiple properties stay easier to manage.
            </p>
          </div>
        </section>

        <section className="landing-section landing-proof-section" id="why-cleanly">
          <div className="landing-section-copy">
            <p className="eyebrow">Less "whose turn?" energy</p>
            <h2>Why Clenella</h2>
            <p className="landing-section-lede">
              Clenella keeps home context, Google Calendar import and export, completion history,
              and recommendations together so the next week starts closer to done. Spend less time
              re-planning the same chores.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
