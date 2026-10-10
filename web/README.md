# Sistema Despertar

Gestão clínica e canal de comunicação entre a Clínica Despertar (terapia para crianças autistas), terapeutas e famílias.
Next.js 16 (App Router, Server Actions) + Supabase (Postgres, Auth, RLS, Storage, Realtime).

Referência de produto: `../docs/mock/sistema-despertar.html`.

## Rodando localmente

Pré-requisitos: Node 20+, Docker Desktop.

```bash
cd web
npm install
npx supabase start          # sobe Postgres/Auth/Storage locais (portas 544xx) e aplica migrations + seed
cp .env.example .env.local  # preencha com as chaves impressas pelo comando acima
npm run dev                 # http://localhost:3457
```

- Studio do banco: http://127.0.0.1:54423 · E-mails (convites, reset de senha): http://127.0.0.1:54424
- Recriar o banco do zero com o seed: `npx supabase db reset`

### Contas de teste (senha `Despertar@2026`)

| Perfil | E-mail |
|---|---|
| Administrador | admin@despertar.local |
| Coordenação | coordenacao@despertar.local |
| Recepção | recepcao@despertar.local |
| Terapeutas | ana@ · mariana@ · juliana@ · camila@ · renata@despertar.local |
| Responsáveis | carla@ (mãe do Lucas) · roberto.silva@ (pai do Lucas) · roberto@ (Pedro) · marcos@ (João) … @despertar.local |

## Testes

```bash
npm test            # Vitest — lógica pura (formatação, cálculos, regras de UI)
npm run test:db     # pgTAP — contrato de acesso (RLS) e regras de negócio no banco
npm run typecheck
npm run lint
```

## Modelo de acesso

| Perfil | Vê |
|---|---|
| `admin` | Tudo operacional e financeiro, configurações, usuários e auditoria. **Não lê prontuário.** |
| `coordination` | Operação, relatórios (aprova/devolve), prontuário (leitura), financeiro. |
| `reception` | Agenda, famílias, pacientes (dados cadastrais), mensagens, solicitações. Sem prontuário e sem financeiro. |
| `therapist` | Só pacientes/famílias com **vínculo ativo** (`care_assignments`): agenda, prontuário, plano, relatórios, documentos, as próprias notas fiscais. |
| `guardian` | Portal da família: os próprios filhos — sessões, recados, documentos, relatórios aprovados, cobranças. |

- O **vínculo** paciente × terapeuta × terapia é a chave de tudo: encerrar o vínculo corta na hora o acesso do terapeuta ao paciente e transforma a conversa com a família em somente leitura.
- Chat (`can_message`): equipe ↔ todos; terapeuta ↔ terapeuta; terapeuta ↔ responsáveis só com vínculo ativo; responsável ↔ responsável nunca.
- Três camadas: menu/páginas por perfil (`requireRole`), Server Actions validadas com zod, e **RLS no Postgres** como fonte de verdade (o `anon` não tem nenhum grant). A secret key só é usada na gestão de contas.
- Arquivos ficam num bucket privado; o download gera URL assinada de 60 s e o storage só assina objetos referenciados por uma linha que o usuário pode ver.
- Auditoria LGPD (`audit_log`): toda escrita em tabelas sensíveis e toda abertura de prontuário (sem gravar o conteúdo clínico).

## Notas fiscais dos terapeutas

1. O admin cadastra o valor de cada terapeuta por terapia: **por sessão** (fixo) ou **por hora** (proporcional à duração real — 45 min a R$ 120/h = R$ 90).
2. Ao concluir a sessão, o terapeuta informa a duração real.
3. O admin cria um período de fechamento (ciclo livre), confere a prévia e gera as solicitações. Cada terapeuta é notificado: "emita a NF de R$ X referente à terapia Y".
4. O terapeuta envia número + arquivo da NF; o admin aprova (ou recusa com motivo) e marca o repasse como pago. Uma sessão nunca entra em duas notas.
