/**
 * Generated Supabase database types.
 *
 * This is a placeholder until the MVP schema is provisioned. Replace by
 * running:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 *
 * Keeping a typed `Database` shape here lets the Supabase clients stay
 * strongly typed end-to-end as tables are added.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
