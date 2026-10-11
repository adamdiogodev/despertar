import { expect, test } from "@playwright/test";
import { USERS, addDaysKey, loginAs, nextWeekMonday, openBell } from "./helpers";

test("Carla pede remarcação, recepção aprova e Carla é notificada", async ({ browser }) => {
  const reason = `Consulta médica E2E ${Date.now()}`;
  // Saturday of the week after next, 10:00: free for every therapist and room in the seed.
  const proposedDate = addDaysKey(nextWeekMonday(), 12);

  const carla = await loginAs(browser, USERS.carla);
  await carla.page.goto("/portal/sessions");
  // The furthest session in the list is safely beyond the 24h notice.
  const session = carla.page.getByTestId("upcoming-session").last();
  await session.getByTestId("reschedule-open").click();
  const dialog = carla.page.getByRole("dialog");
  await dialog.getByLabel("Nova data").fill(proposedDate);
  await dialog.getByLabel("Horário").fill("10:00");
  await dialog.getByLabel("Motivo").fill(reason);
  await dialog.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(dialog).toContainText("Solicitação enviada!");

  const reception = await loginAs(browser, USERS.reception);
  await reception.page.goto("/schedule/requests");
  const card = reception.page.getByTestId("pending-requests").locator("> div").filter({ hasText: reason });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(reception.page.getByTestId("pending-requests").locator("> div").filter({ hasText: reason })).toHaveCount(0);
  await expect(reception.page.getByText(reason)).toBeVisible();

  await carla.page.goto("/portal/sessions");
  await expect(carla.page.getByTestId("reschedule-request").filter({ hasText: reason })).toContainText("Aprovad");
  await openBell(carla.page);
  await expect(carla.page.getByRole("link", { name: /Remarcação aprovada/ })).toBeVisible();

  await reception.context.close();
  await carla.context.close();
});
