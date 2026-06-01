type LandingPageProps = {
  primaryAction: React.ReactNode;
  signInAction: React.ReactNode;
};

export function LandingPage({ primaryAction, signInAction }: LandingPageProps) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a className="landing-brand" href="/" onClick={(event) => event.preventDefault()}>
          Cleanly
        </a>
        <div className="landing-nav-links">
          <a href="#how-cleanly-works">How it works</a>
          <a href="#why-cleanly">Why Cleanly</a>
          <a href="#for-households">For households</a>
          <span className="landing-sign-in">{signInAction}</span>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Less chore math. More flow.</p>
          <h1>Watch the week click into place.</h1>
          <p className="hero-statement">
            Cleanly spots routine gaps, timing problems, and workload drift before
            the week gets away from everyone.
          </p>
          <p className="lede">
            Build a home plan that adapts around real schedules, fair handoffs, and
            the chores that usually slip through the cracks.
          </p>
          <div className="hero-actions">
            <span className="landing-primary-action">{primaryAction}</span>
            <a className="landing-secondary-action" href="#how-cleanly-works">
              How Cleanly works
            </a>
          </div>
        </div>

        <div className="hero-magic-stage" aria-label="Cleanly planning flow preview">
          <div className="landing-beam" aria-hidden="true" />
          <div className="landing-orbit" aria-hidden="true" />
          <span className="landing-spark spark-one" aria-hidden="true" />
          <span className="landing-spark spark-two" aria-hidden="true" />
          <span className="planning-chip chip-duration">duration conflict</span>
          <span className="planning-chip chip-handoff">fairer handoff</span>
          <span className="planning-chip chip-calendar">calendar slot found</span>

          <div className="landing-phone">
            <div className="phone-topline">
              <span>Cleanly</span>
              <strong>Today</strong>
            </div>
            <div className="phone-flow-card is-active">
              <span>Morning</span>
              <strong>Kitchen reset</strong>
              <small>Moved 20 min later</small>
            </div>
            <div className="phone-flow-row">
              <div>
                <span>Handoff</span>
                <strong>Alex to Sam</strong>
              </div>
              <small>balanced</small>
            </div>
            <div className="phone-flow-card">
              <span>Evening</span>
              <strong>Laundry fold</strong>
              <small>fits after dinner</small>
            </div>
            <div className="phone-approval">
              <span>Week plan ready</span>
              <strong>Approve</strong>
            </div>
          </div>

          <div className="landing-plan-surface" aria-hidden="true">
            <span className="surface-dot" />
            <span className="surface-line wide" />
            <span className="surface-line" />
            <span className="surface-line short" />
          </div>
        </div>
      </section>

      <div className="landing-sections">
        <section className="landing-section" id="how-cleanly-works">
          <div className="landing-section-copy">
            <p className="eyebrow">Three simple moves</p>
            <h2>How Cleanly works</h2>
            <p className="landing-section-lede">Start with the home, then let the plan sharpen itself.</p>
          </div>
          <div className="landing-card-grid">
            <article className="landing-info-card">
              <span>01</span>
              <h3>Map the home</h3>
              <p>Capture rooms, floors, routines, and the work that actually keeps the place moving.</p>
            </article>
            <article className="landing-info-card">
              <span>02</span>
              <h3>Spot plan drift</h3>
              <p>See when chores are too long, assigned unevenly, or landing in awkward calendar gaps.</p>
            </article>
            <article className="landing-info-card">
              <span>03</span>
              <h3>Approve a better week</h3>
              <p>Review suggested shifts before they become the household plan everyone follows.</p>
            </article>
          </div>
        </section>

        <section className="landing-section" id="why-cleanly">
          <div className="landing-section-copy">
            <p className="eyebrow">Better household rhythm</p>
            <h2>Why Cleanly</h2>
            <p className="landing-section-lede">The invisible work gets a little easier to see.</p>
          </div>
          <div className="landing-card-grid">
            <article className="landing-info-card">
              <h3>Visibility</h3>
              <p>Keep recurring work, missed routines, and upcoming pressure in one readable view.</p>
            </article>
            <article className="landing-info-card">
              <h3>Fairness</h3>
              <p>Notice workload drift early, before one person silently absorbs the week.</p>
            </article>
            <article className="landing-info-card">
              <h3>Calendar confidence</h3>
              <p>Shape chores around real time, not the optimistic version of everyone&apos;s schedule.</p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-household-panel" id="for-households">
          <div className="landing-section-copy">
            <p className="eyebrow">Home first</p>
            <h2>For households</h2>
            <p className="landing-section-lede">
              Built for one home first, with room for shared responsibility.
            </p>
          </div>
          <p>
            Cleanly works whether you are setting up your own routines, coordinating with a partner,
            or keeping a family aligned. It does not require multiple homes or complex setup to be
            useful: start with the place you live, then invite people when the plan needs more hands.
          </p>
        </section>
      </div>
    </main>
  );
}
