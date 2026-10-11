"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { startConversation } from "./actions";
import type { ContactGroup } from "./contacts";

export function NewConversation({ groups, roleLabels }: { groups: ContactGroup[]; roleLabels: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({ ...group, contacts: group.contacts.filter((c) => c.full_name.toLowerCase().includes(term)) }))
    .filter((group) => group.contacts.length > 0);

  return (
    <Modal trigger="+ Nova conversa" triggerSize="sm" title="Nova conversa">
      <Input
        name="contact_search"
        placeholder="Buscar pelo nome..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-4"
      />
      {filtered.length === 0 && <EmptyState title="Nenhum contato disponível" icon="👥" />}
      {filtered.map((group) => (
        <div key={group.label} className="mb-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-t3">{group.label}</div>
          {group.contacts.map((contact) => (
            <form key={contact.id} action={startConversation}>
              <input type="hidden" name="other_profile" value={contact.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-line-light"
                data-testid="contact-option"
              >
                <Avatar name={contact.full_name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-t1">{contact.full_name}</span>
                  <span className="block text-[11px] text-t3">{contact.specialty ?? roleLabels[contact.role]}</span>
                </span>
              </button>
            </form>
          ))}
        </div>
      ))}
    </Modal>
  );
}
