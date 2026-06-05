import type { CalendarPreferences, CleanlyCalendarEvent, ExternalCalendarSummary } from "@chore-helper/shared";
import { DateRangePicker } from "./DateRangePicker";
import type { CalendarDateRange, CalendarDateRangePreset } from "./dateRange";

type CalendarExportPanelProps = {
  eligibleEvents: CleanlyCalendarEvent[];
  externalCalendars: ExternalCalendarSummary[];
  preferences?: CalendarPreferences;
  range: CalendarDateRange;
  rangePreset: CalendarDateRangePreset;
  selectedEventIds: string[];
  visibleRange: CalendarDateRange;
  onCancel: () => void;
  onClearSelection: () => void;
  onDestinationCalendarChange: (calendarId: string) => void;
  onExport: () => void;
  onExportContentChange: (mode: CalendarPreferences["exportContentMode"]) => void;
  onRangeChange: (range: CalendarDateRange) => void;
  onRangePresetChange: (preset: CalendarDateRangePreset, range: CalendarDateRange) => void;
  onSelectEligible: () => void;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function CalendarExportPanel({
  eligibleEvents,
  externalCalendars,
  preferences,
  range,
  rangePreset,
  selectedEventIds,
  visibleRange,
  onCancel,
  onClearSelection,
  onDestinationCalendarChange,
  onExport,
  onExportContentChange,
  onRangeChange,
  onRangePresetChange,
  onSelectEligible
}: CalendarExportPanelProps) {
  const selectedEvents = eligibleEvents.filter((event) => selectedEventIds.includes(event.id));
  const selectedChoreCount = selectedEvents.filter((event) => event.type === "chore").length;
  const selectedCommitmentCount = selectedEvents.filter((event) => event.type === "commitment").length;
  const destinationCalendar = externalCalendars.find((calendar) => calendar.id === preferences?.destinationExternalCalendarId);
  const canExport = selectedEventIds.length > 0 && Boolean(preferences?.destinationExternalCalendarId);

  return (
    <aside className="calendar-export-panel" role="region" aria-label="Exporting Cleanly events">
      <div className="calendar-export-panel-header">
        <p className="eyebrow">Work my calendar</p>
        <h2>Exporting Cleanly events</h2>
        <p>Use the range helper to grab a batch, then fine-tune individual events on the calendar.</p>
      </div>

      {preferences ? (
        <div className="calendar-export-panel-fields">
          <label>
            From Cleanly
            <select
              value={preferences.exportContentMode}
              onChange={(event) => onExportContentChange(event.target.value as CalendarPreferences["exportContentMode"])}
            >
              <option value="chores">Chores</option>
              <option value="commitments">Commitments</option>
              <option value="both">Chores and commitments</option>
            </select>
          </label>
          <label>
            To calendar
            <select
              value={preferences.destinationExternalCalendarId ?? ""}
              onChange={(event) => onDestinationCalendarChange(event.target.value)}
            >
              <option value="">Choose destination calendar</option>
              {externalCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
              ))}
            </select>
          </label>
          <DateRangePicker
            idPrefix="export-events-range"
            label="Export date range"
            onPresetChange={onRangePresetChange}
            onRangeChange={onRangeChange}
            preset={rangePreset}
            range={range}
            visibleRange={visibleRange}
          />
        </div>
      ) : null}

      <div className="calendar-export-batch-actions" aria-label="Export selection helpers">
        <button className="section-action" onClick={onSelectEligible} type="button">
          Select {pluralize(eligibleEvents.length, "eligible event")}
        </button>
        <button className="section-action" onClick={onClearSelection} type="button">Clear selection</button>
      </div>

      <div className="calendar-export-summary-bar">
        <strong>{selectedEventIds.length} selected</strong>
        <span>{selectedChoreCount} chores / {selectedCommitmentCount} commitments</span>
        <span>{destinationCalendar ? "Ready to export" : "Choose a destination calendar first"}</span>
      </div>

      <div className="calendar-export-actions">
        <button className="section-action" onClick={onCancel} type="button">Cancel export</button>
        <button disabled={!canExport} onClick={onExport} type="button">Export selected</button>
      </div>
    </aside>
  );
}
