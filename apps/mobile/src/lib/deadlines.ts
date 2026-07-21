export function canClientEdit(
  nowIso: string,
  proofWindowIso: string,
  status: string,
) {
  return new Date(nowIso) < new Date(proofWindowIso) && status === "upcoming";
}
