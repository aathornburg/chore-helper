type LandingPageProps = {
  actions: React.ReactNode;
};

export function LandingPage({ actions }: LandingPageProps) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a href="/" onClick={(event) => event.preventDefault()}>
          Cleanly
        </a>
        <span className="landing-nav-note">Household planning made clear</span>
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
            {actions}
            <span>Build routines now. Connect calendars and balance workload as your home plan grows.</span>
          </div>
        </div>

        <div className="hero-preview" aria-label="Cleanly dashboard preview">
          <div className="preview-toolbar">
            <span>Today</span>
            <span>Optimize</span>
            <span>Calendar</span>
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
