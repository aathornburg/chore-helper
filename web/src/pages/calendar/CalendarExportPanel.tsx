import type { CalendarPreferences, CleanlyCalendarEvent, ExternalCalendarSummary } from "@chore-helper/shared";
import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import type { CalendarDateRange, CalendarDateRangePreset } from "./dateRange";

type CalendarExportPreselectPanelProps = {
  eligibleEvents: CleanlyCalendarEvent[];
  preferences?: CalendarPreferences;
  range: CalendarDateRange;
  rangePreset: CalendarDateRangePreset;
  selectedEventIds: string[];
  visibleRange: CalendarDateRange;
  onClearSelection: () => void;
  onExportContentChange: (mode: CalendarPreferences["exportContentMode"]) => void;
  onRangeChange: (range: CalendarDateRange) => void;
  onRangePresetChange: (preset: CalendarDateRangePreset, range: CalendarDateRange) => void;
};

type CalendarExportReviewPanelProps = {
  eligibleEvents: CleanlyCalendarEvent[];
  externalCalendars: ExternalCalendarSummary[];
  preferences?: CalendarPreferences;
  selectedEventIds: string[];
  onDestinationCalendarChange: (calendarId: string) => void;
  onExport: () => void;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function exportContentLabel(mode: CalendarPreferences["exportContentMode"]) {
  if (mode === "chores") return "chores";
  if (mode === "commitments") return "commitments";
  return "chores and commitments";
}

function rangePresetLabel(preset: CalendarDateRangePreset) {
  if (preset === "this_week") return "this week";
  if (preset === "next_2_weeks") return "the next 2 weeks";
  if (preset === "this_month") return "this month";
  if (preset === "custom") return "custom dates";
  return "the visible range";
}

export function CalendarExportPreselectPanel({
  eligibleEvents,
  preferences,
  range,
  rangePreset,
  selectedEventIds,
  visibleRange,
  onClearSelection,
  onExportContentChange,
  onRangeChange,
  onRangePresetChange
}: CalendarExportPreselectPanelProps) {
  const [isPreselectOpen, setIsPreselectOpen] = useState(false);
  const selectedSummary = `${selectedEventIds.length} selected`;
  const preselectSummary = preferences
    ? `Select options: ${exportContentLabel(preferences.exportContentMode)} from ${rangePresetLabel(rangePreset)}`
    : "Select options";

  return (
    <aside className="calendar-export-panel calendar-export-preselect-panel" role="region" aria-label="Export preselect controls">
      {preferences ? (
        <div className="calendar-export-preselect-bar">
          <strong>Preselect:</strong>
          <span>{selectedEventIds.length > 0 ? `${selectedSummary}. Click the calendar to fine-tune.` : "Nothing selected yet. Click events or use selection options."}</span>
          <span className="calendar-export-preselect-actions">
            <button className="link-button" disabled={selectedEventIds.length === 0} onClick={onClearSelection} type="button">Clear</button>
            <button
              aria-controls="calendar-export-preselect-popover"
              aria-expanded={isPreselectOpen}
              className="section-action calendar-export-summary-trigger"
              onClick={() => setIsPreselectOpen((current) => !current)}
              type="button"
            >
              {preselectSummary}
            </button>
          </span>
          {isPreselectOpen ? (
            <section className="calendar-export-popover calendar-export-preselect-popover" id="calendar-export-preselect-popover" aria-label="Preselect options">
              <div>
                <p className="eyebrow">Preselect events</p>
                <h3>Choose what Cleanly selects</h3>
                <p>Changing these options preselects matching events automatically. Click calendar items afterward to fine-tune.</p>
              </div>
              <div className="calendar-export-popover-grid">
                <label>
                  Event type
                  <select
                    value={preferences.exportContentMode}
                    onChange={(event) => {
                      onExportContentChange(event.target.value as CalendarPreferences["exportContentMode"]);
                    }}
                  >
                    <option value="chores">Chores</option>
                    <option value="commitments">Commitments</option>
                    <option value="both">Chores and commitments</option>
                  </select>
                </label>
                <DateRangePicker
                  idPrefix="export-events-range"
                  label="Date range"
                  onPresetChange={onRangePresetChange}
                  onRangeChange={onRangeChange}
                  preset={rangePreset}
                  range={range}
                  visibleRange={visibleRange}
                />
              </div>
              <div className="calendar-export-popover-actions">
                <span>{pluralize(eligibleEvents.length, "event")} match</span>
                <button onClick={() => setIsPreselectOpen(false)} type="button">Close</button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export function CalendarExportReviewPanel({
  eligibleEvents,
  externalCalendars,
  preferences,
  selectedEventIds,
  onDestinationCalendarChange,
  onExport
}: CalendarExportReviewPanelProps) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const selectedEvents = eligibleEvents.filter((event) => selectedEventIds.includes(event.id));
  const selectedChoreCount = selectedEvents.filter((event) => event.type === "chore").length;
  const selectedCommitmentCount = selectedEvents.filter((event) => event.type === "commitment").length;
  const canExport = selectedEventIds.length > 0 && Boolean(preferences?.destinationExternalCalendarId);
  const selectedSummary = `${selectedEventIds.length} selected`;

  return (
    <aside className="calendar-export-panel calendar-export-review-panel" role="region" aria-label="Export review controls">
      <div className="calendar-export-summary-bar">
        <span className="calendar-export-required-label">Review required</span>
        <strong>{selectedSummary}</strong>
        <span>{selectedChoreCount} chores / {selectedCommitmentCount} commitments</span>
        <span>Review selected events before choosing a destination calendar.</span>
        <button disabled={selectedEventIds.length === 0} onClick={() => setIsReviewOpen((current) => !current)} type="button">Review</button>
      </div>

      {isReviewOpen ? (
        <section className="calendar-export-popover calendar-export-review-popover" role="dialog" aria-label="Review export">
          <div className="calendar-export-review-heading">
            <div>
              <p className="eyebrow">Review export</p>
              <h3>Selected events</h3>
            </div>
            <button className="link-button" onClick={() => setIsReviewOpen(false)} type="button">Close</button>
          </div>
          <ul className="calendar-export-selected-list">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <span aria-hidden="true" />
                <strong>{event.privacyTitle}</strong>
                <small>{event.type}</small>
              </li>
            ))}
          </ul>
          <div className="calendar-export-review-actions">
            <label>
              To calendar
              <select
                value={preferences?.destinationExternalCalendarId ?? ""}
                onChange={(event) => onDestinationCalendarChange(event.target.value)}
              >
                <option value="">Choose destination calendar</option>
                {externalCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                ))}
              </select>
            </label>
            <button disabled={!canExport} onClick={onExport} type="button">
              Export {pluralize(selectedEventIds.length, "selected event")}
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
