type LandingPageProps = {
  onGetStarted: () => void;
};

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a href="/" onClick={(event) => event.preventDefault()}>
          Cleanly
        </a>
        <button onClick={onGetStarted} type="button">Open app</button>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">A shared plan for the people who live there</p>
          <h1>Cleanly</h1>
          <p className="hero-statement">
            Make household work visible, fair, and easier to adjust.
          </p>
          <p className="lede">
            Optimize recurring chores, catch missed routines, and turn family calendars into a
            clearer home operating rhythm.
          </p>
          <div className="hero-actions">
            <button onClick={onGetStarted} type="button">Get Started</button>
            <span>Demo household included for this first slice.</span>
          </div>
        </div>

        <div className="hero-preview" aria-label="Cleanly dashboard preview">
          <div className="preview-toolbar">
            <span>Today</span>
            <span>Plan</span>
            <span>Family</span>
          </div>
          <div className="preview-grid">
            <div className="preview-card wide">
              <span>Plan health</span>
              <strong>82%</strong>
              <p>3 duration concerns need a second look.</p>
            </div>
            <div className="preview-card">
              <span>People</span>
              <strong>3</strong>
              <p>Shared workload view.</p>
            </div>
            <div className="preview-card">
              <span>Week view</span>
              <strong>12</strong>
              <p>Upcoming chores.</p>
            </div>
            <div className="preview-card wide accent-preview">
              <span>Expert recommendation</span>
              <p>Review bathroom duration before accepting calendar changes.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
