// Deliberately small generated-type facade for the implemented client surface.
// Run `supabase gen types typescript --linked > src/types/database.generated.ts` after linking production.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export interface Database { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never>; }; }
