import type { Database } from "@/lib/database.types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export type ScheduleAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  therapistId: string;
  therapistName: string;
  therapistColor: string;
  therapyName: string;
  roomId: string | null;
  roomName: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  cancelReason: string | null;
  familyConfirmation: string | null;
  familyConfirmationNote: string | null;
};

export type ScheduleViewer = { userId: string; isStaff: boolean };

export type Option = { id: string; name: string };

export const STATUS_META: Record<AppointmentStatus, { label: string; tone: "green" | "yellow" | "red" | "blue" | "purple" | "gray" }> = {
  scheduled: { label: "Agendada", tone: "blue" },
  confirmed: { label: "Confirmada", tone: "green" },
  completed: { label: "Concluída", tone: "purple" },
  canceled: { label: "Cancelada", tone: "gray" },
  no_show: { label: "Falta", tone: "red" },
};

export const OPEN_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed"];
