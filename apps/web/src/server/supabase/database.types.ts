export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      billing_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          event_created_at: string
          event_type: string
          livemode: boolean
          object_id: string
          processed_at: string | null
          processing_status: string
          received_at: string
          stripe_event_id: string
        }
        Insert: {
          event_created_at: string
          event_type: string
          livemode: boolean
          object_id: string
          processed_at?: string | null
          processing_status: string
          received_at?: string
          stripe_event_id: string
        }
        Update: {
          event_created_at?: string
          event_type?: string
          livemode?: boolean
          object_id?: string
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          feature_code: string
          plan_code: string
          source_subscription_id: number
          user_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          feature_code: string
          plan_code: string
          source_subscription_id: number
          user_id: string
          valid_from: string
          valid_until: string
        }
        Update: {
          created_at?: string
          feature_code?: string
          plan_code?: string
          source_subscription_id?: number
          user_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_feature_code_fkey"
            columns: ["feature_code"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "entitlements_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "entitlements_source_subscription_id_fkey"
            columns: ["source_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          created_at: string
          feature_code: string
          limit_unit: string | null
          limit_value: number | null
          matrix_version: number
          plan_code: string
        }
        Insert: {
          created_at?: string
          feature_code: string
          limit_unit?: string | null
          limit_value?: number | null
          matrix_version?: number
          plan_code: string
        }
        Update: {
          created_at?: string
          feature_code?: string
          limit_unit?: string | null
          limit_value?: number | null
          matrix_version?: number
          plan_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_code_fkey"
            columns: ["feature_code"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "plan_features_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          access_duration_days: number | null
          active: boolean
          billing_interval: string | null
          billing_mode: string
          code: string
          created_at: string
          currency: string
          name: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          access_duration_days?: number | null
          active?: boolean
          billing_interval?: string | null
          billing_mode: string
          code: string
          created_at?: string
          currency: string
          name: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          unit_amount: number
          updated_at?: string
        }
        Update: {
          access_duration_days?: number | null
          active?: boolean
          billing_interval?: string | null
          billing_mode?: string
          code?: string
          created_at?: string
          currency?: string
          name?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          ended_at: string | null
          external_key: string
          id: number
          last_stripe_event_created_at: string
          plan_code: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          ended_at?: string | null
          external_key: string
          id?: never
          last_stripe_event_created_at: string
          plan_code: string
          status: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          external_key?: string
          id?: never
          last_stripe_event_created_at?: string
          plan_code?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string
          stripe_price_id?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_api_rate_limit: {
        Args: { p_bucket: string }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      apply_stripe_billing_state: {
        Args: {
          p_cancel_at_period_end: boolean
          p_canceled_at: string | null
          p_current_period_end: string
          p_current_period_start: string
          p_ended_at: string | null
          p_event_created_at: string
          p_event_id: string
          p_event_type: string
          p_external_key: string
          p_livemode: boolean
          p_status: string
          p_stripe_checkout_session_id: string | null
          p_stripe_customer_id: string
          p_stripe_price_id: string
          p_stripe_subscription_id: string | null
          p_user_id: string
        }
        Returns: string
      }
      has_active_entitlement: {
        Args: { p_feature_code: string }
        Returns: boolean
      }
      get_billing_catalog: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_duration_days: number | null
          billing_interval: string | null
          billing_mode: string
          code: string
          currency: string
          feature_code: string | null
          feature_description: string | null
          name: string
          unit_amount: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
