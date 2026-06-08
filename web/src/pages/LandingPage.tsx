type LandingPageProps = {
  primaryAction: React.ReactNode;
  signInAction: React.ReactNode;
};

export function LandingPage({ primaryAction, signInAction }: LandingPageProps) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing">
        <a className="landing-brand" href="/" onClick={(event) => event.preventDefault()}>
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
                <span className="preview-event is-optimization-source">
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
                <span className="preview-event"><strong>Bathroom reset</strong></span>
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
            <svg className="cleanly-marker-layer" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="landing-arrow-teal" markerHeight="9" markerWidth="9" orient="auto" refX="8" refY="4.5">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#147186" />
                </marker>
              </defs>
              <g className="marker-optimization-layer">
                <ellipse className="marker-ring marker-green marker-draw delay-three" pathLength="1" cx="650" cy="176" rx="54" ry="30" />
                <path className="marker-line marker-flow marker-draw delay-two" pathLength="1" markerEnd="url(#landing-arrow-teal)" d="M 386 88 C 462 54, 578 88, 650 176" />
                <circle className="marker-pulse delay-two" cx="389" cy="84" r="8" />
              </g>
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
