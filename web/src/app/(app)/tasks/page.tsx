import { MANAGER_ROLES, ROLE_LABELS, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, localDateKey } from "@/lib/format";
import { Avatar, Badge, Button, Card, CardTitle, EmptyState, PageHeader, Tabs, cn } from "@/components/ui/primitives";
import { TaskForm } from "./task-form";
import { NotesForm } from "./notes-form";
import { deleteTask, setTaskStatus } from "./actions";

type View = "assigned" | "created" | "all";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireRole(TEAM_ROLES);
  const isManager = MANAGER_ROLES.includes(user.role);
  const { tab } = await searchParams;
  const view: View = tab === "created" ? "created" : tab === "all" && isManager ? "all" : "assigned";

  const supabase = await createClient();
  let tasksQuery = supabase
    .from("tasks")
    .select(
      "id, title, description, priority, status, due_date, completed_at, created_at, assigned_to, created_by, assignee:profiles!tasks_assigned_to_fkey(full_name, role), creator:profiles!tasks_created_by_fkey(full_name, role), patient:patients(full_name)",
    )
    .order("status")
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (view === "assigned") tasksQuery = tasksQuery.eq("assigned_to", user.id);
  if (view === "created") tasksQuery = tasksQuery.eq("created_by", user.id);

  const [{ data: tasks }, { data: assignees }, { data: patients }, { data: note }] = await Promise.all([
    tasksQuery,
    supabase.from("profiles").select("id, full_name, role").eq("active", true).neq("role", "guardian").order("full_name"),
    supabase.from("patients").select("id, full_name").neq("status", "inactive").order("full_name"),
    supabase.from("personal_notes").select("content").eq("profile_id", user.id).maybeSingle(),
  ]);

  const today = localDateKey(new Date());
  const tabs = [
    { key: "assigned", label: "Atribuídas a mim", href: "/tasks" },
    { key: "created", label: "Criadas por mim", href: "/tasks?tab=created" },
    ...(isManager ? [{ key: "all", label: "Todas", href: "/tasks?tab=all" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Pedidos entre a equipe e suas anotações pessoais"
        actions={<TaskForm assignees={assignees ?? []} patients={patients ?? []} roleLabels={ROLE_LABELS} />}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          <Tabs tabs={tabs} active={view} />
          {!tasks?.length && (
            <Card>
              <EmptyState title="Nenhuma tarefa por aqui" icon="✅" />
            </Card>
          )}
          <div className="grid gap-3" data-testid="task-list">
            {tasks?.map((task) => {
              const done = task.status === "done";
              const overdue = !done && task.due_date && task.due_date < today;
              const canToggle = task.assigned_to === user.id || task.created_by === user.id || isManager;
              const counterpart = view === "assigned" ? task.creator : task.assignee;
              return (
                <Card key={task.id} className={cn("p-4", done && "opacity-60")}>
                  <div className="mb-2 flex items-center gap-2 text-xs text-t2">
                    {counterpart && <Avatar name={counterpart.full_name} size={22} />}
                    <span className="truncate">
                      {view === "assigned" ? "De " : "Para "}
                      <b className="text-t1">{counterpart?.full_name ?? "—"}</b>
                      {counterpart && ` · ${ROLE_LABELS[counterpart.role]}`}
                      {view === "all" && task.creator && ` · criada por ${task.creator.full_name}`}
                    </span>
                    <span className="ml-auto flex shrink-0 gap-1.5">
                      {done ? (
                        <Badge tone="green">✅ Concluída</Badge>
                      ) : task.priority === "urgent" ? (
                        <Badge tone="red">🔴 Urgente</Badge>
                      ) : (
                        <Badge tone="blue">Normal</Badge>
                      )}
                      {overdue && <Badge tone="yellow">Atrasada</Badge>}
                    </span>
                  </div>
                  <div className={cn("text-sm font-semibold text-t1", done && "text-t3 line-through")}>{task.title}</div>
                  {task.description && <p className="mt-1 whitespace-pre-wrap text-xs text-t2">{task.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-t3">
                      {task.patient?.full_name && <>Paciente: {task.patient.full_name} · </>}
                      Criada em {formatDate(task.created_at)}
                      {done
                        ? ` · Concluída em ${formatDate(task.completed_at)}`
                        : task.due_date
                          ? ` · Vence em ${formatDate(task.due_date)}`
                          : " · Sem prazo"}
                    </span>
                    <div className="flex gap-1.5">
                      {canToggle && (
                        <form action={setTaskStatus}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="status" value={done ? "open" : "done"} />
                          <Button size="sm" variant={done ? "ghost" : "success"}>
                            {done ? "Reabrir" : "✓ Concluir"}
                          </Button>
                        </form>
                      )}
                      {task.created_by === user.id && (
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <Button size="sm" variant="ghost" aria-label="Excluir tarefa">
                            Excluir
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <Card>
            <CardTitle>Minhas notas pessoais</CardTitle>
            <NotesForm content={note?.content ?? ""} />
          </Card>
        </div>
      </div>
    </>
  );
}
