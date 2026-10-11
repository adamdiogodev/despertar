export const REQUEST_TYPE_LABELS = {
  information: "Informação sobre o atendimento",
  reschedule: "Remarcação de sessão",
  billing: "Dúvida sobre cobrança",
  document: "Envio de documento",
  data_update: "Atualização de dados",
  other: "Outro",
} as const;

export const REQUEST_STATUS = {
  open: { label: "Aguardando", tone: "yellow" },
  answered: { label: "Respondida", tone: "green" },
  closed: { label: "Encerrada", tone: "gray" },
} as const;
