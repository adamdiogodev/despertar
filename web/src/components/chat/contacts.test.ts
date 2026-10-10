import { describe, expect, it } from "vitest";
import { groupContacts, type Contact } from "./contacts";

const contacts: Contact[] = [
  { id: "1", full_name: "Ana", role: "therapist", specialty: "Psicóloga" },
  { id: "2", full_name: "Fernanda", role: "reception", specialty: null },
  { id: "3", full_name: "Carla", role: "guardian", specialty: null },
  { id: "4", full_name: "Cristiane", role: "coordination", specialty: null },
];

describe("groupContacts", () => {
  it("splits a guardian's contacts into therapists and clinic staff", () => {
    const groups = groupContacts("guardian", contacts.filter((c) => c.role !== "guardian"));
    expect(groups.map((g) => g.label)).toEqual(["Terapeutas dos meus filhos", "Equipe da clínica"]);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(["1"]);
    expect(groups[1].contacts.map((c) => c.id)).toEqual(["2", "4"]);
  });

  it("splits a therapist's contacts into families and team", () => {
    const groups = groupContacts("therapist", contacts);
    expect(groups.map((g) => g.label)).toEqual(["Famílias dos meus pacientes", "Equipe"]);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(["3"]);
  });

  it("groups by role for staff and drops empty groups", () => {
    const groups = groupContacts("admin", contacts);
    expect(groups.map((g) => g.label)).toEqual(["Coordenação", "Recepção", "Terapeutas", "Responsáveis"]);
  });

  it("returns no groups when there are no contacts", () => {
    expect(groupContacts("therapist", [])).toEqual([]);
  });
});
