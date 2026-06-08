# Pre-Auth Calendar Control Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the signed-out Clenella landing page with the approved calendar-control-tower hero that positions Clenella as a calendar manager first and chore optimizer second.

**Architecture:** Keep `LandingPage` as the signed-out entry point and keep auth wiring unchanged through the existing `primaryAction` and `signInAction` props. Implement the hero as static React markup plus CSS-native layout and SVG marker animation; no backend, routing, schema, generated image, or third-party animation dependency is required. Keep below-fold sections focused and supportive, but do not build a separate marketing site framework.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, CSS/SVG animation in `web/src/App.css`.

---

## Scope

Implement the approved A1 direction from `docs/landing-marketing-creative-comparison.html`:

- Calendar-control-tower hero.
- Clenella brand script treatment consistent with the authenticated app.
- Public nav only: `How it works`, `Google Calendar`, `Family load`, `Sign in`.
- Primary CTA stays wired to the existing Clerk sign-up action via `primaryAction`.
- Secondary CTA scrolls to the in-page `How it works` section.
- Product visual shows a believable calendar surface.
- Chore optimization is communicated by animated marker-style SVG overlay, not literal event labels:
  - X through a poor chore slot.
  - Arrow moving a chore to a better calendar spot.
  - Circle around a chore becoming shorter.
  - Reassignment arrow for family balance.
- Animation respects `prefers-reduced-motion`.
- Google Calendar integration can be marketed as available on this pre-auth page.

Out of scope:

- Backend changes.
- Clerk/auth changes.
- Calendar OAuth implementation changes.
- App route changes.
- Rebuilding the authenticated Calendar page.
- Moving landing CSS to CSS Modules in this slice. That remains covered by `docs/superpowers/plans/2026-05-31-frontend-architecture-cleanup.md`.

## File Structure

- Modify `web/src/pages/LandingPage.tsx`: Replace the current cinematic/product-board hero and stale below-fold content with the approved calendar-control hero and focused marketing sections.
- Modify `web/src/App.css`: Replace the current landing-specific selectors near the top of the file with the new landing layout, calendar preview, SVG marker animation, and responsive rules.
- Modify `web/src/App.test.tsx`: Update the signed-out landing assertions so they lock the new message, public nav, calendar-control copy, and absence of authenticated app nav.
- Keep `docs/landing-marketing-creative-comparison.html`: Preserve as design reference. Do not import it into production code.

## Task 1: Lock The Signed-Out Landing Contract

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Replace the signed-out landing test expectations**

In `web/src/App.test.tsx`, update the existing `it("shows auth entry points when signed out", async () => { ... })` body with:

```tsx
  it("shows auth entry points when signed out", async () => {
    mockClerkSignedOut();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/today");

    expect(screen.getByRole("heading", { name: "Put chores where the week actually has room." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build my home plan" })).toBeTruthy();
    expect(screen.getAllByText(/calendar manager first/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Clenella reads the shape of your week/i)).toBeTruthy();

    const nav = screen.getByRole("navigation", { name: "Landing" });
    expect(within(nav).getByRole("link", { name: "How it works" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Google Calendar" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Family load" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Optimize" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Today" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Calendar" })).toBeNull();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();

    expect(screen.getByRole("region", { name: "Clenella calendar optimization preview" })).toBeTruthy();
    expect(screen.getByText("Family week control tower")).toBeTruthy();
    expect(screen.getByText("Synced with Google Calendar")).toBeTruthy();
    expect(screen.getByText("Google Calendar added: practice, dentist, trash pickup, school event")).toBeTruthy();
    expect(screen.getAllByText("Bathroom reset").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Laundry fold")).toBeTruthy();
    expect(screen.getByText("Approve week")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "How Clenella works" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why Clenella" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Calendar manager first" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chore optimizer second" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balanced for the household" })).toBeTruthy();

    expect(screen.queryByText("Home model")).toBeNull();
    expect(screen.queryByText("Choose chores")).toBeNull();
    expect(screen.queryByText("Recommendations")).toBeNull();
    expect(screen.queryByRole("heading", { name: "For households" })).toBeNull();
    expect(screen.queryByText("duration conflict")).toBeNull();
    expect(screen.queryByText("calendar slot found")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

Do not assert marker SVG text such as `move`, `shorter`, or `reassign`; those labels should not exist in the final hero.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "shows auth entry points when signed out"
```

Expected: FAIL. The failure should mention the missing heading `Put chores where the week actually has room.` or missing nav links such as `Google Calendar`.

- [ ] **Step 3: Commit the failing test only if working in a TDD checkpoint branch**

If using small TDD commits, run:

```bash
git add web/src/App.test.tsx
git commit -m "test: update signed-out landing expectations"
```

If the branch convention is to keep tests and implementation in one commit, skip this commit and keep the failing test staged or unstaged for Task 2.

## Task 2: Replace The Landing Hero Markup

**Files:**
- Modify: `web/src/pages/LandingPage.tsx`

- [ ] **Step 1: Replace `LandingPage.tsx` with the new calendar-control structure**

Replace the current component body with:

```tsx
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
          <a href="#google-calendar">Google Calendar</a>
          <a href="#family-load">Family load</a>
          <span className="landing-sign-in">{signInAction}</span>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Calendar manager first</p>
          <h1>Put chores where the week actually has room.</h1>
          <p className="hero-statement">
            Clenella reads the shape of your week, tracks what got done, and suggests a plan
            that fits calendars, people, properties, and real chore duration.
          </p>
          <p className="lede">
            Connect Google Calendar, keep household routines visible, and approve the
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
            <strong>Family week control tower</strong>
            <span>Synced with Google Calendar</span>
          </div>
          <div className="preview-sync-banner">
            Google Calendar added: practice, dentist, trash pickup, school event
          </div>
          <div className="preview-week">
            <div className="preview-calendar-grid">
              <div className="preview-day">
                <strong>Mon</strong>
                <span className="preview-event is-calendar">Practice 5:30</span>
                <span className="preview-event">Kitchen reset</span>
              </div>
              <div className="preview-day">
                <strong>Tue</strong>
                <span className="preview-event">Bathroom reset</span>
              </div>
              <div className="preview-day">
                <strong>Wed</strong>
                <span className="preview-event">Vacuum main floor<small>30 min</small></span>
              </div>
              <div className="preview-day">
                <strong>Thu</strong>
                <span className="preview-event is-calendar">Dentist</span>
                <span className="preview-event">Bathroom reset</span>
                <span className="preview-event">Laundry fold</span>
              </div>
              <div className="preview-day">
                <strong>Fri</strong>
                <span className="preview-event">Floors<small>20 min</small></span>
              </div>
              <div className="preview-day">
                <strong>Sat</strong>
                <span className="preview-event is-calendar">Lake house</span>
                <span className="preview-event">Property check<small>Grouped with trip</small></span>
              </div>
              <div className="preview-day">
                <strong>Sun</strong>
                <span className="preview-event is-done">Approve week</span>
              </div>
            </div>
            <svg className="cleanly-marker-layer" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="landing-arrow-teal" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="#147186" />
                </marker>
                <marker id="landing-arrow-yellow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="#d7a927" />
                </marker>
                <filter id="landing-marker-wobble">
                  <feTurbulence baseFrequency="0.03" numOctaves="2" seed="8" type="fractalNoise" />
                  <feDisplacementMap in="SourceGraphic" scale="1.8" />
                </filter>
              </defs>
              <g filter="url(#landing-marker-wobble)">
                <path className="marker-line marker-coral marker-fat marker-draw" pathLength="1" d="M 151 74 C 184 102, 225 132, 277 162" />
                <path className="marker-line marker-coral marker-draw" pathLength="1" d="M 151 74 C 184 102, 225 132, 277 162" />
                <path className="marker-line marker-coral marker-thin marker-draw" pathLength="1" d="M 155 78 C 188 105, 226 130, 272 158" />
                <path className="marker-line marker-coral marker-fat marker-draw delay-one" pathLength="1" d="M 279 70 C 243 103, 207 132, 155 166" />
                <path className="marker-line marker-coral marker-draw delay-one" pathLength="1" d="M 279 70 C 243 103, 207 132, 155 166" />
                <path className="marker-line marker-coral marker-thin marker-draw delay-one" pathLength="1" d="M 274 74 C 240 104, 204 133, 160 164" />

                <path className="marker-line marker-fat marker-draw delay-two" pathLength="1" d="M 252 112 C 318 68, 405 70, 490 126 C 511 140, 526 152, 540 166" />
                <path className="marker-line marker-draw delay-two" pathLength="1" markerEnd="url(#landing-arrow-teal)" d="M 252 112 C 318 68, 405 70, 490 126 C 511 140, 526 152, 540 166" />
                <path className="marker-line marker-thin marker-draw delay-two" pathLength="1" d="M 249 117 C 319 76, 399 77, 486 129 C 504 140, 520 151, 535 162" />

                <path className="marker-line marker-green marker-fat marker-draw delay-three" pathLength="1" d="M 469 184 C 494 146, 594 148, 609 181 C 626 216, 548 236, 486 226 C 446 219, 435 199, 469 184" />
                <path className="marker-line marker-green marker-draw delay-three" pathLength="1" d="M 469 184 C 494 146, 594 148, 609 181 C 626 216, 548 236, 486 226 C 446 219, 435 199, 469 184" />
                <path className="marker-line marker-green marker-thin marker-draw delay-three" pathLength="1" d="M 474 188 C 500 153, 586 153, 603 181 C 620 209, 553 229, 492 221 C 454 216, 444 201, 474 188" />

                <path className="marker-line marker-yellow marker-fat marker-draw delay-four" pathLength="1" d="M 127 257 C 93 235, 86 202, 113 173" />
                <path className="marker-line marker-yellow marker-draw delay-four" pathLength="1" markerEnd="url(#landing-arrow-yellow)" d="M 127 257 C 93 235, 86 202, 113 173" />
                <path className="marker-line marker-yellow marker-thin marker-draw delay-four" pathLength="1" d="M 130 253 C 101 230, 95 204, 116 177" />
              </g>
            </svg>
          </div>
        </div>
      </section>

      <div className="landing-sections">
        <section className="landing-section landing-story-section" id="how-cleanly-works">
          <div className="landing-section-copy">
            <p className="eyebrow">How Clenella works</p>
            <h2>How Clenella works</h2>
            <p className="landing-section-lede">
              Set up the home, connect the calendar, and let Clenella turn chore history into a better week.
            </p>
          </div>
          <div className="landing-story-grid">
            <article className="landing-story-card">
              <span className="story-ribbon">01</span>
              <h3>Calendar manager first</h3>
              <p>Google Calendar commitments become real planning constraints before chores land on the week.</p>
            </article>
            <article className="landing-story-card is-offset">
              <span className="story-ribbon">02</span>
              <h3>Chore optimizer second</h3>
              <p>Clenella can move chores, shorten estimates, and suggest a better handoff when completion patterns change.</p>
            </article>
            <article className="landing-story-card">
              <span className="story-ribbon">03</span>
              <h3>Approve the better plan</h3>
              <p>You review the suggested changes before they become part of the recurring household rhythm.</p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-proof-section" id="google-calendar">
          <div className="landing-section-copy">
            <p className="eyebrow">Google Calendar</p>
            <h2>Calendar commitments should shape chore planning.</h2>
            <p className="landing-section-lede">
              Clenella treats practices, appointments, property visits, and blocked evenings as part of the chore plan instead of after-the-fact conflicts.
            </p>
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
            <p className="eyebrow">Why Clenella</p>
            <h2>Spend less time re-planning the same chores.</h2>
            <p className="landing-section-lede">
              Clenella keeps the home context, calendar constraints, completion history, and recommendations together so the next week starts closer to done.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run the focused test and verify the markup now satisfies text expectations**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "shows auth entry points when signed out"
```

Expected: PASS for the focused markup test. CSS is verified visually in Task 4, not by this test. If the focused test fails for missing text, duplicate text, or role mismatch, correct the JSX before moving to Task 3.

## Task 3: Replace Landing Styles With Calendar-Control Styling

**Files:**
- Modify: `web/src/App.css`

- [ ] **Step 1: Replace obsolete landing preview styles**

In `web/src/App.css`, replace the landing-specific styles from `.landing-page` through the landing-specific keyframes with CSS that supports the new hero. Keep shared authenticated app styles below this section intact.

Use this structure as the implementation source:

```css
.landing-page {
  background:
    linear-gradient(90deg, rgba(20, 113, 134, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(20, 113, 134, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 8% 2%, rgba(123, 220, 224, 0.54), transparent 32rem),
    radial-gradient(circle at 93% 8%, rgba(246, 201, 87, 0.34), transparent 26rem),
    linear-gradient(135deg, #f8fdfe 0%, #e7f8fa 58%, #f8fbfc 100%);
  background-size: 42px 42px, 42px 42px, auto, auto, auto;
  color: var(--color-primary-strong);
  min-height: 100vh;
  overflow: hidden;
  padding: 24px;
  position: relative;
}

.landing-nav {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin: 0 auto;
  max-width: 1500px;
  position: relative;
  width: 100%;
  z-index: 2;
}

.landing-brand {
  color: var(--color-primary-strong);
  font-family: "Segoe Script", "Brush Script MT", cursive;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
  text-decoration: none;
}

.landing-nav-links {
  align-items: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(194, 223, 229, 0.9);
  display: flex;
  gap: 8px;
  padding: 7px;
}

.landing-nav-links a {
  color: var(--color-primary-strong);
  font-size: 0.94rem;
  font-weight: 850;
  padding: 10px 13px;
  text-decoration: none;
}

.landing-sign-in button {
  background: var(--color-primary-strong);
  color: white;
  padding: 10px 16px;
}

.landing-hero {
  align-items: center;
  display: grid;
  gap: 48px;
  grid-template-columns: minmax(460px, 0.82fr) minmax(680px, 1.18fr);
  margin: 0 auto;
  max-width: 1500px;
  min-height: min(900px, calc(100vh - 96px));
  padding: 52px 0 64px;
  position: relative;
}

.hero-copy h1 {
  color: #042f3d;
  font-size: clamp(4rem, 6.4vw, 7.1rem);
  letter-spacing: -0.055em;
  line-height: 0.88;
  margin: 0;
}

.hero-copy .hero-statement,
.hero-copy .lede {
  color: #365f6c;
  font-size: 1.08rem;
  line-height: 1.58;
  max-width: 590px;
}

.hero-copy .hero-statement {
  font-weight: 700;
  margin: 22px 0 0;
}

.hero-copy .lede {
  margin: 14px 0 0;
}

.hero-copy .eyebrow,
.landing-section .eyebrow {
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  margin: 0 0 16px;
  text-transform: uppercase;
}

.hero-actions {
  align-items: center;
  display: flex;
  gap: 14px;
  margin-top: 28px;
}

.landing-primary-action button,
.landing-secondary-action {
  align-items: center;
  border: 1px solid var(--color-primary);
  display: inline-flex;
  font-weight: 950;
  min-height: 46px;
  padding: 0 18px;
}

.landing-primary-action button {
  background: var(--color-primary);
  color: white;
}

.landing-secondary-action {
  background: rgba(255, 255, 255, 0.7);
  color: var(--color-primary-strong);
  text-decoration: none;
}

.calendar-control-preview {
  align-self: center;
  background: white;
  border: 1px solid var(--color-border);
  border-left: 8px solid var(--color-primary);
  box-shadow: -16px 16px 0 rgba(42, 165, 180, 0.16);
}

.preview-topline {
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  padding: 18px 22px;
}

.preview-topline strong {
  color: #042f3d;
}

.preview-topline span {
  color: var(--color-primary);
  font-size: 0.74rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.preview-sync-banner {
  background: #fff6d8;
  border-bottom: 1px solid #ead48e;
  color: #71570b;
  font-size: 0.82rem;
  font-weight: 950;
  padding: 12px 22px;
}

.preview-week {
  background: #fbfeff;
  margin: 20px;
  overflow: hidden;
  position: relative;
}

.preview-calendar-grid {
  border: 1px solid var(--color-border);
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  position: relative;
  z-index: 1;
}

.preview-day {
  border-right: 1px solid rgba(7, 63, 79, 0.14);
  min-height: 232px;
  padding: 14px 12px;
}

.preview-day:last-child {
  border-right: 0;
}

.preview-day strong {
  color: #042f3d;
  display: block;
  font-size: 0.8rem;
  margin-bottom: 10px;
}

.preview-event {
  background: white;
  border-left: 4px solid var(--color-primary);
  box-shadow: 0 8px 18px rgba(7, 63, 79, 0.08);
  color: var(--color-primary-strong);
  display: block;
  font-size: 0.74rem;
  font-weight: 850;
  line-height: 1.18;
  margin-top: 7px;
  min-height: 35px;
  padding: 7px 8px;
}

.preview-event small {
  color: #557781;
  display: block;
  font-size: 0.66rem;
  font-weight: 850;
  margin-top: 3px;
}

.preview-event.is-calendar {
  border-color: #f6c957;
}

.preview-event.is-done {
  border-color: var(--color-done);
}

.cleanly-marker-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 3;
}

.marker-line {
  fill: none;
  stroke: var(--color-primary);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 8;
}

.marker-coral {
  stroke: #ef886f;
}

.marker-green {
  stroke: var(--color-done);
}

.marker-yellow {
  stroke: #d7a927;
}

.marker-fat {
  opacity: 0.22;
  stroke-width: 14;
}

.marker-thin {
  opacity: 0.72;
  stroke-width: 5;
}

.marker-draw {
  animation: marker-draw 900ms cubic-bezier(0.72, 0, 0.32, 1) forwards;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}

.marker-draw.delay-one {
  animation-delay: 520ms;
}

.marker-draw.delay-two {
  animation-delay: 980ms;
}

.marker-draw.delay-three {
  animation-delay: 1400ms;
}

.marker-draw.delay-four {
  animation-delay: 1840ms;
}

@keyframes marker-draw {
  to {
    stroke-dashoffset: 0;
  }
}
```

- [ ] **Step 2: Add reduced-motion support**

Add this near the landing keyframes:

```css
@media (prefers-reduced-motion: reduce) {
  .marker-draw {
    animation: none;
    stroke-dashoffset: 0;
  }
}
```

- [ ] **Step 3: Update below-fold section styles**

Keep the existing `.landing-sections`, `.landing-section`, `.landing-story-grid`, and `.landing-story-card` names, but simplify them so they do not look like repeated nested bubbles. Use square or lightly rounded framed panels and stronger typographic hierarchy:

```css
.landing-sections {
  display: grid;
  gap: 28px;
  margin: 0 auto;
  max-width: 1500px;
  padding: 0 0 72px;
  position: relative;
  z-index: 1;
}

.landing-section {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--color-border);
  box-shadow: 14px 14px 0 rgba(42, 165, 180, 0.1);
  padding: 34px;
}

.landing-section h2 {
  color: #042f3d;
  font-size: clamp(2rem, 4vw, 4rem);
  letter-spacing: -0.045em;
  line-height: 0.98;
  margin: 0;
}

.landing-section-lede {
  color: #365f6c;
  font-size: 1.05rem;
  line-height: 1.58;
  margin: 14px 0 0;
  max-width: 760px;
}

.landing-story-grid {
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.landing-story-card {
  background: #fbfeff;
  border: 1px solid var(--color-border);
  display: grid;
  gap: 12px;
  padding: 22px;
}

.landing-story-card.is-offset {
  transform: translateY(22px);
}

.story-ribbon {
  color: var(--color-primary);
  font-size: 0.74rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.landing-story-card h3 {
  color: #042f3d;
  font-size: 1.45rem;
  letter-spacing: -0.025em;
  margin: 0;
}

.landing-story-card p {
  color: #365f6c;
  line-height: 1.48;
  margin: 0;
}
```

- [ ] **Step 4: Add responsive landing rules**

Add or replace landing-specific responsive rules:

```css
@media (max-width: 1180px) {
  .landing-hero {
    grid-template-columns: 1fr;
  }

  .calendar-control-preview {
    width: 100%;
  }
}

@media (max-width: 780px) {
  .landing-page {
    padding: 18px;
  }

  .landing-nav {
    align-items: flex-start;
    gap: 18px;
  }

  .landing-nav-links {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .landing-nav-links a {
    font-size: 0.86rem;
    padding: 8px 10px;
  }

  .hero-copy h1 {
    font-size: clamp(3rem, 18vw, 4.4rem);
  }

  .hero-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-calendar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preview-day {
    border-bottom: 1px solid rgba(7, 63, 79, 0.14);
    min-height: 160px;
  }

  .cleanly-marker-layer {
    display: none;
  }

  .landing-story-grid {
    grid-template-columns: 1fr;
  }

  .landing-story-card.is-offset {
    transform: none;
  }
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "shows auth entry points when signed out"
```

Expected: PASS.

- [ ] **Step 6: Commit the landing hero implementation**

Run:

```bash
git add web/src/pages/LandingPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "feat: redesign signed-out landing hero"
```

If Task 1 already committed the failing test, use:

```bash
git add web/src/pages/LandingPage.tsx web/src/App.css
git commit -m "feat: add calendar-control landing hero"
```

## Task 4: Visual Verification And Polish

**Files:**
- Modify if needed: `web/src/pages/LandingPage.tsx`
- Modify if needed: `web/src/App.css`

- [ ] **Step 1: Start the web app**

Run:

```bash
npm.cmd run dev -w web -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. If the port is busy, use the URL Vite prints.

- [ ] **Step 2: Open the signed-out landing page**

Open the Vite URL while signed out. If the app redirects from `/today`, also check `/`.

Expected visual checks:

- Clenella logo uses the same script style as the authenticated header.
- Hero background reads light, clean teal rather than dark ocean.
- Top nav contains only public links and sign-in.
- Calendar preview is not cramped.
- Chore cards do not clip or overflow.
- Marker animation draws on top of the calendar and does not look like literal app UI.
- The marker overlay communicates moved, shortened, and reassigned chores without text labels.
- On narrow mobile widths, the marker overlay is hidden and the calendar remains readable.

- [ ] **Step 3: Fix concrete visual defects**

If visual verification shows clipping, overlap, or cramped text, adjust only the affected landing selectors. Common fixes:

```css
.preview-day {
  min-height: 248px;
}

.calendar-control-preview {
  max-width: 860px;
}

.hero-copy h1 {
  max-width: 760px;
}
```

Do not add a new design direction during this task. Keep the approved A1 direction.

- [ ] **Step 4: Re-run the focused test after polish**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "shows auth entry points when signed out"
```

Expected: PASS.

- [ ] **Step 5: Commit visual polish**

If Step 3 changed files, run:

```bash
git add web/src/pages/LandingPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "polish: refine signed-out landing preview"
```

If no files changed, skip this commit.

## Task 5: Full Verification

**Files:**
- No planned edits.

- [ ] **Step 1: Run the web test suite**

Run:

```bash
npm.cmd run test -w web
```

Expected: PASS, except for any already-known unrelated date-sensitive calendar tests. If unrelated failures remain, record their test names and confirm the focused landing test passes.

- [ ] **Step 2: Run the web build**

Run:

```bash
npm.cmd run build -w web
```

Expected: PASS.

- [ ] **Step 3: Check the final diff**

Run:

```bash
git diff -- web/src/pages/LandingPage.tsx web/src/App.css web/src/App.test.tsx
```

Expected:

- `LandingPage.tsx` contains the calendar-control hero and focused marketing sections.
- `App.css` contains the marker SVG animation and no old `.landing-product-board`, `.board-home-model`, `.board-review-flow`, `.landing-orbit`, `.landing-plan-surface`, or `.landing-spark` styles unless another remaining component still uses them.
- `App.test.tsx` asserts the new signed-out copy and public nav.

- [ ] **Step 4: Commit verification notes if docs changed**

If the implementation revealed a design correction that should be preserved, update `docs/landing-marketing-creative-comparison.html` or create a short note in `docs/superpowers/specs/`, then run:

```bash
git add docs/landing-marketing-creative-comparison.html docs/superpowers/specs
git commit -m "docs: record landing design correction"
```

If no docs changed, skip this commit.

## Self-Review

- Spec coverage: The plan covers the approved A1 calendar-control direction, public nav, sign-up/sign-in wiring, Google Calendar marketing, family-load marketing, marker overlay, reduced-motion support, responsive behavior, focused tests, build, and browser verification.
- Placeholder scan: No task relies on `TBD`, unspecified implementation, or vague "add tests" language. Each task names exact files, commands, and expected outcomes.
- Type consistency: The plan uses the existing `LandingPageProps` shape, existing `primaryAction` and `signInAction` props, existing Vitest/Testing Library test style, and CSS class names introduced in the JSX.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-pre-auth-calendar-control-landing.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
