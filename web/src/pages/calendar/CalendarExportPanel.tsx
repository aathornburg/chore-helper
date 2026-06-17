import type { CalendarPreferences, CleanlyCalendarEvent, ExternalCalendarSummary } from "@chore-helper/shared";
import { useState } from "react";
import { SideSheet } from "../../components/SideSheet";
import { DateRangePicker } from "./DateRangePicker";
import type { CalendarDateRange, CalendarDateRangePreset } from "./dateRange";

type CalendarExportQuickSelectPanelProps = {
  eligibleEvents: CleanlyCalendarEvent[];
  preferences?: CalendarPreferences;
  range: CalendarDateRange;
  rangePreset: CalendarDateRangePreset;
  visibleRange: CalendarDateRange;
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
  if (mode === "chores") return "tasks";
  if (mode === "commitments") return "commitments";
  return "tasks and commitments";
}

function rangePresetLabel(preset: CalendarDateRangePreset) {
  if (preset === "this_week") return "this week";
  if (preset === "next_2_weeks") return "the next 2 weeks";
  if (preset === "this_month") return "this month";
  if (preset === "custom") return "custom dates";
  return "the visible range";
}

function eventTypeLabel(type: CleanlyCalendarEvent["type"]) {
  return type === "commitment" ? "Commitment" : "Task";
}

export function CalendarExportQuickSelectPanel({
  eligibleEvents,
  preferences,
  range,
  rangePreset,
  visibleRange,
  onExportContentChange,
  onRangeChange,
  onRangePresetChange
}: CalendarExportQuickSelectPanelProps) {
  const [isPreselectOpen, setIsPreselectOpen] = useState(false);
  const preselectSummary = preferences
    ? `${exportContentLabel(preferences.exportContentMode)} from ${rangePresetLabel(rangePreset)}`
    : "Choose a batch of events";

  return (
    <aside className="calendar-export-panel calendar-export-preselect-panel" role="region" aria-label="Export quick select controls">
      {preferences ? (
        <div className="calendar-export-quick-select">
          <button
            aria-controls="calendar-export-preselect-popover"
            aria-expanded={isPreselectOpen}
            className="section-action calendar-export-summary-trigger"
            onClick={() => setIsPreselectOpen((current) => !current)}
            type="button"
          >
            Quick select
          </button>
          {isPreselectOpen ? (
            <section className="calendar-export-popover calendar-export-preselect-popover" id="calendar-export-preselect-popover" aria-label="Quick select options">
              <div>
                <p className="eyebrow">Quick select</p>
                <h3>Select matching events</h3>
                <p>Currently set to {preselectSummary}. Change these options to select matching events automatically.</p>
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
                    <option value="chores">Tasks</option>
                    <option value="commitments">Commitments</option>
                    <option value="both">Tasks and commitments</option>
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
  const selectedTaskCount = selectedEvents.filter((event) => event.type === "chore").length;
  const selectedCommitmentCount = selectedEvents.filter((event) => event.type === "commitment").length;
  const canExport = selectedEventIds.length > 0 && Boolean(preferences?.destinationExternalCalendarId);
  const selectedSummary = `${selectedEventIds.length} selected`;
  const taskSummary = pluralize(selectedTaskCount, "task");
  const commitmentSummary = pluralize(selectedCommitmentCount, "commitment");

  return (
    <aside className="calendar-export-panel calendar-export-review-panel" role="region" aria-label="Export review controls">
      <div className="calendar-export-summary-bar">
        <span className="calendar-export-selection-count">
          <strong>{selectedSummary}</strong>
        </span>
        <span className="calendar-export-type-count">
          <strong>Tasks</strong>
          <span>{taskSummary}</span>
        </span>
        <span className="calendar-export-type-count">
          <strong>Commitments</strong>
          <span>{commitmentSummary}</span>
        </span>
        <button className="calendar-export-review-button" disabled={selectedEventIds.length === 0} onClick={() => setIsReviewOpen((current) => !current)} type="button">
          Review <span>{selectedEventIds.length}</span>
        </button>
      </div>

      {isReviewOpen ? (
        <SideSheet
          ariaLabel="Review export"
          className="calendar-export-review-sheet"
          eyebrow="Review export"
          footer={(
            <div className="calendar-export-review-sheet-footer">
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
          )}
          onClose={() => setIsReviewOpen(false)}
          title="Selected events"
        >
          <div className="calendar-export-review-sheet-summary">
            <span>
              <strong>{selectedSummary}</strong>
              <small>Total</small>
            </span>
            <span>
              <strong>{taskSummary}</strong>
              <small>Tasks</small>
            </span>
            <span>
              <strong>{commitmentSummary}</strong>
              <small>Commitments</small>
            </span>
          </div>

          <ul className="calendar-export-selected-list">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <span aria-hidden="true" />
                <strong>{event.privacyTitle}</strong>
                <small>{eventTypeLabel(event.type)}</small>
              </li>
            ))}
          </ul>
        </SideSheet>
      ) : null}
    </aside>
  );
}
