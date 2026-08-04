/**
 * Database types, kept in step with supabase/migrations/.
 *
 * Hand-written rather than generated so the repo has no dependency on the
 * Supabase CLI being installed. The shape deliberately mirrors what
 * `supabase gen types typescript` emits — in particular these are `type`
 * aliases, not interfaces, because only aliases receive the implicit index
 * signature that postgrest-js's `GenericSchema` constraint requires.
 *
 * If you do install the CLI, regenerate with:
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 */

import type { Role, Timeline, Interest } from "@/lib/validation";

export type SignupRow = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  notes: string | null;
  role: Role;
  timeline: Timeline | null;
  interests: Interest[];
  consent: boolean;
  consent_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  source: "web" | "kiosk";
  confirmation: string;
  created_at: string;
};

export type EventRow = {
  id: string;
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

export type SignupInsert = Omit<SignupRow, "id" | "created_at" | "consent_at"> &
  Partial<Pick<SignupRow, "id" | "created_at" | "consent_at">>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      signups: {
        Row: SignupRow;
        Insert: SignupInsert;
        Update: Partial<SignupInsert>;
        Relationships: [
          {
            foreignKeyName: "signups_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: EventRow;
        Insert: Omit<EventRow, "id" | "created_at"> &
          Partial<Pick<EventRow, "id" | "created_at">>;
        Update: Partial<Omit<EventRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      signup_rate_exceeded: {
        Args: {
          p_ip_hash: string;
          p_window?: string;
          p_limit?: number;
        };
        Returns: boolean;
      };
    };
    Enums: {
      signup_role: Role;
      signup_timeline: Timeline;
      signup_interest: Interest;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
