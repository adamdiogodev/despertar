import type { Database } from "@/lib/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type Contact = { id: string; full_name: string; role: AppRole; specialty: string | null };
export type ContactGroup = { label: string; contacts: Contact[] };

const STAFF_GROUP_ORDER: { role: AppRole; label: string }[] = [
  { role: "admin", label: "Administração" },
  { role: "coordination", label: "Coordenação" },
  { role: "reception", label: "Recepção" },
  { role: "therapist", label: "Terapeutas" },
  { role: "guardian", label: "Responsáveis" },
];

// Groups the contacts returned by list_message_contacts() the way each profile
// thinks about them. Empty groups are dropped.
export function groupContacts(viewerRole: AppRole, contacts: Contact[]): ContactGroup[] {
  let groups: ContactGroup[];
  if (viewerRole === "guardian") {
    groups = [
      { label: "Terapeutas dos meus filhos", contacts: contacts.filter((c) => c.role === "therapist") },
      { label: "Equipe da clínica", contacts: contacts.filter((c) => c.role !== "therapist") },
    ];
  } else if (viewerRole === "therapist") {
    groups = [
      { label: "Famílias dos meus pacientes", contacts: contacts.filter((c) => c.role === "guardian") },
      { label: "Equipe", contacts: contacts.filter((c) => c.role !== "guardian") },
    ];
  } else {
    groups = STAFF_GROUP_ORDER.map(({ role, label }) => ({ label, contacts: contacts.filter((c) => c.role === role) }));
  }
  return groups.filter((group) => group.contacts.length > 0);
}
