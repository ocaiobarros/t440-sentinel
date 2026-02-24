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
          category: string | null
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
          category?: string | null
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
          category?: string | null
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
      flow_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_map_cables: {
        Row: {
          cable_type: Database["public"]["Enums"]["cable_type"]
          color_override: string | null
          created_at: string
          distance_km: number | null
          fiber_count: number
          geometry: Json
          id: string
          label: string
          map_id: string
          source_node_id: string
          source_node_type: string
          target_node_id: string
          target_node_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cable_type?: Database["public"]["Enums"]["cable_type"]
          color_override?: string | null
          created_at?: string
          distance_km?: number | null
          fiber_count?: number
          geometry?: Json
          id?: string
          label?: string
          map_id: string
          source_node_id: string
          source_node_type?: string
          target_node_id: string
          target_node_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cable_type?: Database["public"]["Enums"]["cable_type"]
          color_override?: string | null
          created_at?: string
          distance_km?: number | null
          fiber_count?: number
          geometry?: Json
          id?: string
          label?: string
          map_id?: string
          source_node_id?: string
          source_node_type?: string
          target_node_id?: string
          target_node_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cable_map"
            columns: ["map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_maps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "flow_map_cables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_map_ctos: {
        Row: {
          capacity: Database["public"]["Enums"]["cto_capacity"]
          created_at: string
          description: string | null
          id: string
          lat: number
          lon: number
          map_id: string
          metadata: Json
          name: string
          occupied_ports: number
          olt_host_id: string | null
          pon_port_index: number | null
          status_calculated: Database["public"]["Enums"]["cto_status"]
          tenant_id: string
          updated_at: string
          zabbix_host_ids: string[] | null
        }
        Insert: {
          capacity?: Database["public"]["Enums"]["cto_capacity"]
          created_at?: string
          description?: string | null
          id?: string
          lat: number
          lon: number
          map_id: string
          metadata?: Json
          name?: string
          occupied_ports?: number
          olt_host_id?: string | null
          pon_port_index?: number | null
          status_calculated?: Database["public"]["Enums"]["cto_status"]
          tenant_id: string
          updated_at?: string
          zabbix_host_ids?: string[] | null
        }
        Update: {
          capacity?: Database["public"]["Enums"]["cto_capacity"]
          created_at?: string
          description?: string | null
          id?: string
          lat?: number
          lon?: number
          map_id?: string
          metadata?: Json
          name?: string
          occupied_ports?: number
          olt_host_id?: string | null
          pon_port_index?: number | null
          status_calculated?: Database["public"]["Enums"]["cto_status"]
          tenant_id?: string
          updated_at?: string
          zabbix_host_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cto_map"
            columns: ["map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_maps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "fk_cto_olt_secure"
            columns: ["olt_host_id", "map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_map_hosts"
            referencedColumns: ["id", "map_id", "tenant_id"]
          },
          {
            foreignKeyName: "flow_map_ctos_olt_host_id_fkey"
            columns: ["olt_host_id"]
            isOneToOne: false
            referencedRelation: "flow_map_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_map_ctos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_map_effective_cache: {
        Row: {
          computed_at: string
          host_count: number | null
          map_id: string
          max_depth: number | null
          payload: Json
          rpc_duration_ms: number | null
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          host_count?: number | null
          map_id: string
          max_depth?: number | null
          payload?: Json
          rpc_duration_ms?: number | null
          tenant_id: string
        }
        Update: {
          computed_at?: string
          host_count?: number | null
          map_id?: string
          max_depth?: number | null
          payload?: Json
          rpc_duration_ms?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_map_effective_cache_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: true
            referencedRelation: "flow_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_map_effective_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_map_hosts: {
        Row: {
          created_at: string
          current_status: Database["public"]["Enums"]["link_status"]
          host_group: string
          host_name: string
          icon_type: string
          id: string
          is_critical: boolean
          lat: number
          lon: number
          map_id: string
          tenant_id: string
          updated_at: string
          zabbix_host_id: string
        }
        Insert: {
          created_at?: string
          current_status?: Database["public"]["Enums"]["link_status"]
          host_group?: string
          host_name?: string
          icon_type?: string
          id?: string
          is_critical?: boolean
          lat: number
          lon: number
          map_id: string
          tenant_id: string
          updated_at?: string
          zabbix_host_id: string
        }
        Update: {
          created_at?: string
          current_status?: Database["public"]["Enums"]["link_status"]
          host_group?: string
          host_name?: string
          icon_type?: string
          id?: string
          is_critical?: boolean
          lat?: number
          lon?: number
          map_id?: string
          tenant_id?: string
          updated_at?: string
          zabbix_host_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_host_map"
            columns: ["map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_maps"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      flow_map_link_events: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          link_id: string
          started_at: string
          status: Database["public"]["Enums"]["link_status"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          link_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["link_status"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          link_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["link_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_fmle_link"
            columns: ["link_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_map_links"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      flow_map_link_items: {
        Row: {
          created_at: string
          direction: string
          id: string
          key_: string
          link_id: string
          metric: string
          name: string
          side: string
          tenant_id: string
          zabbix_host_id: string
          zabbix_item_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          key_?: string
          link_id: string
          metric: string
          name?: string
          side: string
          tenant_id: string
          zabbix_host_id: string
          zabbix_item_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          key_?: string
          link_id?: string
          metric?: string
          name?: string
          side?: string
          tenant_id?: string
          zabbix_host_id?: string
          zabbix_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_fmli_link"
            columns: ["link_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_map_links"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      flow_map_links: {
        Row: {
          capacity_mbps: number
          created_at: string
          current_status: Database["public"]["Enums"]["link_status"]
          dest_host_id: string
          dest_role: string
          geometry: Json
          id: string
          is_ring: boolean
          last_status_change: string | null
          link_type: string
          map_id: string
          origin_host_id: string
          origin_role: string
          priority: number
          status_strategy: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity_mbps?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["link_status"]
          dest_host_id: string
          dest_role?: string
          geometry?: Json
          id?: string
          is_ring?: boolean
          last_status_change?: string | null
          link_type?: string
          map_id: string
          origin_host_id: string
          origin_role?: string
          priority?: number
          status_strategy?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity_mbps?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["link_status"]
          dest_host_id?: string
          dest_role?: string
          geometry?: Json
          id?: string
          is_ring?: boolean
          last_status_change?: string | null
          link_type?: string
          map_id?: string
          origin_host_id?: string
          origin_role?: string
          priority?: number
          status_strategy?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_link_map"
            columns: ["map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_maps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "flow_map_links_dest_host_id_fkey"
            columns: ["dest_host_id"]
            isOneToOne: false
            referencedRelation: "flow_map_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_map_links_origin_host_id_fkey"
            columns: ["origin_host_id"]
            isOneToOne: false
            referencedRelation: "flow_map_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_map_reservas: {
        Row: {
          comprimento_m: number | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          lat: number
          lon: number
          map_id: string
          status: string
          tenant_id: string
          tipo_cabo: string
          updated_at: string
        }
        Insert: {
          comprimento_m?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          lat: number
          lon: number
          map_id: string
          status?: string
          tenant_id: string
          tipo_cabo?: string
          updated_at?: string
        }
        Update: {
          comprimento_m?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          lat?: number
          lon?: number
          map_id?: string
          status?: string
          tenant_id?: string
          tipo_cabo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reserva_map"
            columns: ["map_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "flow_maps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "flow_map_reservas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_maps: {
        Row: {
          center_lat: number
          center_lon: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          refresh_interval: number
          tenant_id: string
          theme: string
          updated_at: string
          zoom: number
        }
        Insert: {
          center_lat?: number
          center_lon?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          refresh_interval?: number
          tenant_id: string
          theme?: string
          updated_at?: string
          zoom?: number
        }
        Update: {
          center_lat?: number
          center_lon?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          refresh_interval?: number
          tenant_id?: string
          theme?: string
          updated_at?: string
          zoom?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_maps_tenant_id_fkey"
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
          job_title: string | null
          language: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          job_title?: string | null
          language?: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          language?: string
          phone?: string | null
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
      telemetry_config: {
        Row: {
          config_key: string
          config_value: string
          id: string
          iv: string | null
          tag: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          id?: string
          iv?: string | null
          tag?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          id?: string
          iv?: string | null
          tag?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_heartbeat: {
        Row: {
          event_count: number
          last_webhook_at: string | null
          last_webhook_source: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          event_count?: number
          last_webhook_at?: string | null
          last_webhook_source?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          event_count?: number
          last_webhook_at?: string | null
          last_webhook_source?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_heartbeat_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
      webhook_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          revoked_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_tokens_tenant_id_fkey"
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
      bump_telemetry_heartbeat: {
        Args: { p_source?: string; p_tenant_id: string }
        Returns: undefined
      }
      check_viability: {
        Args: {
          p_lat: number
          p_lon: number
          p_map_id: string
          p_tenant_id: string
        }
        Returns: {
          capacity: string
          cto_id: string
          cto_name: string
          distance_m: number
          free_ports: number
          occupied_ports: number
          status_calculated: string
        }[]
      }
      get_map_effective_status: {
        Args: { p_map_id: string }
        Returns: {
          depth: number
          effective_status: string
          host_id: string
          is_root_cause: boolean
        }[]
      }
      get_user_tenant_id: { Args: { p_user_id: string }; Returns: string }
      has_any_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_tenant_id: string
          p_user_id: string
        }
        Returns: boolean
      }
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
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      jwt_tenant_id: { Args: never; Returns: string }
      sla_sweep_breaches: { Args: { p_tenant_id?: string }; Returns: number }
      verify_webhook_token: { Args: { p_token: string }; Returns: string }
    }
    Enums: {
      alert_status: "open" | "ack" | "resolved"
      app_role: "admin" | "editor" | "viewer" | "tech" | "sales"
      cable_type: "AS" | "ASU" | "Geleado" | "ADSS" | "Outro"
      cto_capacity: "8" | "16" | "32"
      cto_status: "OK" | "DEGRADED" | "CRITICAL" | "UNKNOWN"
      link_status: "UP" | "DOWN" | "DEGRADED" | "UNKNOWN"
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
      app_role: ["admin", "editor", "viewer", "tech", "sales"],
      cable_type: ["AS", "ASU", "Geleado", "ADSS", "Outro"],
      cto_capacity: ["8", "16", "32"],
      cto_status: ["OK", "DEGRADED", "CRITICAL", "UNKNOWN"],
      link_status: ["UP", "DOWN", "DEGRADED", "UNKNOWN"],
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
