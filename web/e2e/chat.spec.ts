import { expect, test } from "@playwright/test";
import { USERS, loginAs } from "./helpers";

test("Carla e Ana trocam recados em tempo real; Renata não é contato da Carla", async ({ browser }) => {
  const stamp = Date.now();
  const carla = await loginAs(browser, USERS.carla);
  await carla.page.goto("/portal/messages");

  await carla.page.getByRole("button", { name: "+ Nova conversa" }).click();
  const dialog = carla.page.getByRole("dialog");
  await expect(dialog.getByTestId("contact-option").first()).toBeVisible();
  await expect(dialog.getByTestId("contact-option").filter({ hasText: "Renata Lima" })).toHaveCount(0);
  await dialog.getByTestId("contact-option").filter({ hasText: "Ana Paula Souza" }).click();
  await expect(carla.page).toHaveURL(/\/portal\/messages\?c=/);
  const conversationId = new URL(carla.page.url()).searchParams.get("c");

  const ana = await loginAs(browser, USERS.ana);
  await ana.page.goto(`/messages?c=${conversationId}`);
  await expect(ana.page.getByText("Carla Silva").first()).toBeVisible();
  await expect(ana.page.getByTestId("chat-input")).toBeVisible();

  const question = `Oi Ana, tudo bem? Recado E2E ${stamp}`;
  await carla.page.getByTestId("chat-input").fill(question);
  await carla.page.getByTestId("chat-send").click();
  await expect(carla.page.getByTestId("chat-messages")).toContainText(question);

  // Arrives over Realtime, without reloading Ana's page.
  await expect(ana.page.getByTestId("chat-messages")).toContainText(question);

  const answer = `Oi Carla! Resposta E2E ${stamp}`;
  await ana.page.getByTestId("chat-input").fill(answer);
  await ana.page.getByTestId("chat-input").press("Enter");
  await expect(ana.page.getByTestId("chat-messages")).toContainText(answer);
  await expect(carla.page.getByTestId("chat-messages")).toContainText(answer);

  await ana.context.close();
  await carla.context.close();
});
