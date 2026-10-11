"use client";

import { useState } from "react";
import { Badge, EmptyState, cn } from "@/components/ui/primitives";
import { formatTime, localDateKey } from "@/lib/format";
import { GRID_END_HOUR, GRID_START_HOUR, blockPosition, layoutLanes, localTimeKey } from "@/lib/schedule";
import { AppointmentDetail } from "./appointment-detail";
import { STATUS_META, type Option, type ScheduleAppointment, type ScheduleViewer } from "./types";

const HOUR_HEIGHT = 60;
const DAY_NAMES = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => GRID_START_HOUR + index);

function dayNumber(dateKey: string) {
  return dateKey.slice(8, 10);
}

export function ScheduleView({
  appointments,
  days,
  todayKey,
  viewer,
  rooms,
}: {
  appointments: ScheduleAppointment[];
  days: string[];
  todayKey: string;
  viewer: ScheduleViewer;
  rooms: Option[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Looked up by id so the modal shows fresh data after a server action revalidates.
  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? null;
  const byDay = days.map((day) => appointments.filter((appointment) => localDateKey(appointment.startsAt) === day));

  return (
    <>
      {/* Desktop: weekly grid */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-white shadow-card md:block" data-testid="schedule-grid">
        <div className="grid grid-cols-[64px_repeat(6,1fr)] border-b border-line">
          <div />
          {days.map((day, index) => (
            <div key={day} className="px-2 py-3 text-center">
              <div className="text-[11px] font-bold uppercase text-t3">{DAY_NAMES[index]}</div>
              <div className={cn("mt-0.5 text-lg font-extrabold", day === todayKey ? "text-primary" : "text-t1")}>{dayNumber(day)}</div>
            </div>
          ))}
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <div className="grid grid-cols-[64px_repeat(6,1fr)]">
            <div>
              {HOURS.map((hour) => (
                <div key={hour} className="px-2 pt-1 text-[10px] font-semibold text-t3" style={{ height: HOUR_HEIGHT }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {byDay.map((items, dayIndex) => {
              const lanes = layoutLanes(items);
              return (
                <div key={days[dayIndex]} className={cn("relative border-l border-line-light", days[dayIndex] === todayKey && "bg-primary-light/30")}>
                  {HOURS.map((hour) => (
                    <div key={hour} className="border-b border-line-light" style={{ height: HOUR_HEIGHT }} />
                  ))}
                  {items.map((appointment, index) => {
                    const { top, height } = blockPosition(appointment.startsAt, appointment.endsAt, HOUR_HEIGHT);
                    const { lane, lanes: laneCount } = lanes[index];
                    const canceled = appointment.status === "canceled";
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => setSelectedId(appointment.id)}
                        data-testid="schedule-block"
                        title={`${appointment.patientName} — ${appointment.therapyName} (${STATUS_META[appointment.status].label})`}
                        className={cn(
                          "absolute z-[1] overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left transition hover:z-[2] hover:brightness-95",
                          canceled && "opacity-50",
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                          width: `calc(${100 / laneCount}% - 4px)`,
                          background: `${appointment.therapistColor}1F`,
                          borderLeftColor: appointment.therapistColor,
                        }}
                      >
                        <div className={cn("truncate text-[11px] font-bold text-t1", canceled && "line-through")}>{appointment.patientName}</div>
                        <div className={cn("truncate text-[10px] text-t3", canceled && "line-through")}>
                          {localTimeKey(appointment.startsAt)} · {appointment.therapyName}
                          {appointment.roomName && ` · ${appointment.roomName}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile: list per day */}
      <div className="space-y-4 md:hidden" data-testid="schedule-list">
        {appointments.length === 0 && <EmptyState title="Nenhuma sessão nesta semana" icon="📅" />}
        {byDay.map((items, dayIndex) =>
          items.length === 0 ? null : (
            <div key={days[dayIndex]}>
              <div className={cn("mb-2 text-xs font-bold uppercase", days[dayIndex] === todayKey ? "text-primary" : "text-t3")}>
                {DAY_NAMES[dayIndex]} {dayNumber(days[dayIndex])}/{days[dayIndex].slice(5, 7)}
              </div>
              <div className="space-y-2">
                {items.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => setSelectedId(appointment.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border border-line border-l-4 bg-white px-3 py-2.5 text-left shadow-card",
                      appointment.status === "canceled" && "opacity-60",
                    )}
                    style={{ borderLeftColor: appointment.therapistColor }}
                  >
                    <div className="w-12 shrink-0 text-xs font-bold text-t1">{formatTime(appointment.startsAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm font-bold text-t1", appointment.status === "canceled" && "line-through")}>
                        {appointment.patientName}
                      </div>
                      <div className="truncate text-xs text-t3">
                        {appointment.therapyName} · {appointment.therapistName}
                        {appointment.roomName && ` · ${appointment.roomName}`}
                      </div>
                    </div>
                    <Badge tone={STATUS_META[appointment.status].tone}>{STATUS_META[appointment.status].label}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <AppointmentDetail appointment={selected} viewer={viewer} rooms={rooms} onClose={() => setSelectedId(null)} />
    </>
  );
}
