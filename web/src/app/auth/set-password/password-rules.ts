// Mirrors supabase/config.toml: minimum_password_length = 10 and
// password_requirements = "lower_upper_letters_digits".
export const PASSWORD_HINT = "Mínimo de 10 caracteres, com letra maiúscula, letra minúscula e número.";

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Use pelo menos 10 caracteres.");
  if (!/[A-Z]/.test(password)) problems.push("Inclua uma letra maiúscula.");
  if (!/[a-z]/.test(password)) problems.push("Inclua uma letra minúscula.");
  if (!/\d/.test(password)) problems.push("Inclua um número.");
  return problems;
}
