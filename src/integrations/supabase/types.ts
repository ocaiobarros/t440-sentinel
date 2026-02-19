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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_events: {
        Row: {
          alert_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["alert_status"] | null
          id: string
          message: string | null
          occurred_at: string
          payload: Json
          tenant_id: string
          to_status: Database["public"]["Enums"]["alert_status"] | null
          user_id: string | null
        }
        Insert: {
          alert_id: string
          event_type: string
          from_status?: Database["public"]["Enums"]["alert_status"] | null
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json
          tenant_id: string
          to_status?: Database["public"]["Enums"]["alert_status"] | null
          user_id?: string | null
        }
        Update: {
          alert_id?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["alert_status"] | null
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["alert_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alert_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_instances: {
        Row: {
          ack_breached_at: string | null
          ack_due_at: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          dedupe_key: string
          id: string
          last_seen_at: string
          opened_at: string
          payload: Json
          resolve_breached_at: string | null
          resolve_due_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["alert_status"]
          summary: string | null
          suppressed: boolean
          suppressed_by_maintenance_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          ack_breached_at?: string | null
          ack_due_at?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          last_seen_at?: string
          opened_at?: string
          payload?: Json
          resolve_breached_at?: string | null
          resolve_due_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["alert_status"]
          summary?: string | null
          suppressed?: boolean
          suppressed_by_maintenance_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          ack_breached_at?: string | null
          ack_due_at?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          last_seen_at?: string
          opened_at?: string
          payload?: Json
          resolve_breached_at?: string | null
          resolve_due_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["alert_status"]
          summary?: string | null
          suppressed?: boolean
          suppressed_by_maintenance_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_instances_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_suppressed_by_maintenance_id_fkey"
            columns: ["suppressed_by_maintenance_id"]
            isOneToOne: false
            referencedRelation: "maintenance_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_notifications: {
        Row: {
          alert_id: string
          attempts: number
          channel_id: string | null
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string | null
          policy_id: string | null
          request: Json
          response: Json
          sent_at: string | null
          status: string
          step_id: string | null
          tenant_id: string
        }
        Insert: {
          alert_id: string
          attempts?: number
          channel_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          policy_id?: string | null
          request?: Json
          response?: Json
          sent_at?: string | null
          status?: string
          step_id?: string | null
          tenant_id: string
        }
        Update: {
          alert_id?: string
          attempts?: number
          channel_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          policy_id?: string | null
          request?: Json
          response?: Json
          sent_at?: string | null
          status?: string
          step_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alert_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "escalation_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          auto_resolve: boolean
          created_at: string
          created_by: string | null
          dashboard_id: string | null
          dedupe_key_template: string
          escalation_policy_id: string | null
          id: string
          is_enabled: boolean
          matchers: Json
          name: string
          resolve_on_missing: boolean
          severity: Database["public"]["Enums"]["severity_level"]
          sla_policy_id: string | null
          source: string
          tenant_id: string
          updated_at: string
          zabbix_connection_id: string | null
        }
        Insert: {
          auto_resolve?: boolean
          created_at?: string
          created_by?: string | null
          dashboard_id?: string | null
          dedupe_key_template?: string
          escalation_policy_id?: string | null
          id?: string
          is_enabled?: boolean
          matchers?: Json
          name: string
          resolve_on_missing?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          sla_policy_id?: string | null
          source?: string
          tenant_id: string
          updated_at?: string
          zabbix_connection_id?: string | null
        }
        Update: {
          auto_resolve?: boolean
          created_at?: string
          created_by?: string | null
          dashboard_id?: string | null
          dedupe_key_template?: string
          escalation_policy_id?: string | null
          id?: string
          is_enabled?: boolean
          matchers?: Json
          name?: string
          resolve_on_missing?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          sla_policy_id?: string | null
          source?: string
          tenant_id?: string
          updated_at?: string
          zabbix_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_escalation_policy_id_fkey"
            columns: ["escalation_policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_zabbix_connection_id_fkey"
            columns: ["zabbix_connection_id"]
            isOneToOne: false
            referencedRelation: "zabbix_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          layout: Json
          name: string
          settings: Json
          tenant_id: string
          updated_at: string
          zabbix_connection_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          layout?: Json
          name?: string
          settings?: Json
          tenant_id: string
          updated_at?: string
          zabbix_connection_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          layout?: Json
          name?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
          zabbix_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_zabbix_connection_id_fkey"
            columns: ["zabbix_connection_id"]
            isOneToOne: false
            referencedRelation: "zabbix_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_policies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_steps: {
        Row: {
          channel_id: string
          created_at: string
          delay_seconds: number
          enabled: boolean
          id: string
          policy_id: string
          step_order: number
          target: Json
          tenant_id: string
          throttle_seconds: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          policy_id: string
          step_order: number
          target?: Json
          tenant_id: string
          throttle_seconds?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          policy_id?: string
          step_order?: number
          target?: Json
          tenant_id?: string
          throttle_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "escalation_steps_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_steps_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_scopes: {
        Row: {
          created_at: string
          id: string
          maintenance_id: string
          scope_meta: Json
          scope_type: Database["public"]["Enums"]["maintenance_scope_type"]
          scope_value: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          maintenance_id: string
          scope_meta?: Json
          scope_type: Database["public"]["Enums"]["maintenance_scope_type"]
          scope_value?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          maintenance_id?: string
          scope_meta?: Json
          scope_type?: Database["public"]["Enums"]["maintenance_scope_type"]
          scope_value?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_scopes_maintenance_id_fkey"
            columns: ["maintenance_id"]
            isOneToOne: false
            referencedRelation: "maintenance_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_scopes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_windows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          name: string
          starts_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          starts_at: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_windows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          channel: Database["public"]["Enums"]["notify_channel"]
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notify_channel"]
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notify_channel"]
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rms_connections: {
        Row: {
          created_at: string
          created_by: string | null
          encryption_version: number
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          token_ciphertext: string
          token_iv: string
          token_tag: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encryption_version?: number
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          token_ciphertext: string
          token_iv: string
          token_tag: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encryption_version?: number
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          token_ciphertext?: string
          token_iv?: string
          token_tag?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "rms_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          ack_target_seconds: number
          business_hours: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          resolve_target_seconds: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ack_target_seconds?: number
          business_hours?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          resolve_target_seconds?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ack_target_seconds?: number
          business_hours?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          resolve_target_seconds?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      widgets: {
        Row: {
          adapter: Json
          config: Json
          created_at: string
          created_by: string | null
          dashboard_id: string
          height: number
          id: string
          position_x: number
          position_y: number
          query: Json
          title: string
          updated_at: string
          widget_type: string
          width: number
        }
        Insert: {
          adapter?: Json
          config?: Json
          created_at?: string
          created_by?: string | null
          dashboard_id: string
          height?: number
          id?: string
          position_x?: number
          position_y?: number
          query?: Json
          title?: string
          updated_at?: string
          widget_type: string
          width?: number
        }
        Update: {
          adapter?: Json
          config?: Json
          created_at?: string
          created_by?: string | null
          dashboard_id?: string
          height?: number
          id?: string
          position_x?: number
          position_y?: number
          query?: Json
          title?: string
          updated_at?: string
          widget_type?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      zabbix_connections: {
        Row: {
          created_at: string
          created_by: string | null
          encryption_version: number
          id: string
          is_active: boolean
          name: string
          password_ciphertext: string
          password_iv: string
          password_tag: string
          tenant_id: string
          updated_at: string
          url: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encryption_version?: number
          id?: string
          is_active?: boolean
          name: string
          password_ciphertext: string
          password_iv: string
          password_tag: string
          tenant_id: string
          updated_at?: string
          url: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encryption_version?: number
          id?: string
          is_active?: boolean
          name?: string
          password_ciphertext?: string
          password_iv?: string
          password_tag?: string
          tenant_id?: string
          updated_at?: string
          url?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "zabbix_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alert_transition: {
        Args: {
          p_alert_id: string
          p_message?: string
          p_payload?: Json
          p_to: Database["public"]["Enums"]["alert_status"]
          p_user_id: string
        }
        Returns: undefined
      }
      get_user_tenant_id: { Args: { p_user_id: string }; Returns: string }
      has_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_tenant_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_in_maintenance: {
        Args: { p_now: string; p_scope?: Json; p_tenant_id: string }
        Returns: string
      }
      sla_sweep_breaches: { Args: { p_tenant_id?: string }; Returns: number }
    }
    Enums: {
      alert_status: "open" | "ack" | "resolved"
      app_role: "admin" | "editor" | "viewer"
      maintenance_scope_type:
        | "tenant_all"
        | "zabbix_connection"
        | "dashboard"
        | "host"
        | "hostgroup"
        | "trigger"
        | "tag"
      notify_channel: "webhook" | "slack" | "email" | "sms" | "telegram"
      severity_level: "info" | "warning" | "average" | "high" | "disaster"
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
    Enums: {
      alert_status: ["open", "ack", "resolved"],
      app_role: ["admin", "editor", "viewer"],
      maintenance_scope_type: [
        "tenant_all",
        "zabbix_connection",
        "dashboard",
        "host",
        "hostgroup",
        "trigger",
        "tag",
      ],
      notify_channel: ["webhook", "slack", "email", "sms", "telegram"],
      severity_level: ["info", "warning", "average", "high", "disaster"],
    },
  },
} as const
