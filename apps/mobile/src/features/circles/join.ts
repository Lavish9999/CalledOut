import { supabase } from "../../lib/supabase";

export async function joinCircle(code: string) {
  const { data, error } = await supabase.rpc("join_circle_by_code_v2", {
    p_code: code.trim().toUpperCase(),
  });

  if (error) throw error;

  const result = (data ?? {}) as {
    ok?: boolean;
    circle_id?: string;
    error?: string;
  };

  if (!result.ok || !result.circle_id) {
    throw new Error(result.error ?? "CalledOut could not join this circle.");
  }

  return result.circle_id;
}
