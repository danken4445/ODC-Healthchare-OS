export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointment_slots: {
        Row: {
          appointment_id: string | null;
          clinic_service_id: string | null;
          created_at: string;
          end_at: string;
          id: string;
          organization_id: string;
          practitioner_role_id: string;
          service_type: string | null;
          start_at: string;
          status: Database["public"]["Enums"]["slot_status"];
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          clinic_service_id?: string | null;
          created_at?: string;
          end_at: string;
          id?: string;
          organization_id: string;
          practitioner_role_id: string;
          service_type?: string | null;
          start_at: string;
          status?: Database["public"]["Enums"]["slot_status"];
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          clinic_service_id?: string | null;
          created_at?: string;
          end_at?: string;
          id?: string;
          organization_id?: string;
          practitioner_role_id?: string;
          service_type?: string | null;
          start_at?: string;
          status?: Database["public"]["Enums"]["slot_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_slots_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_slots_clinic_service_id_fkey";
            columns: ["clinic_service_id"];
            isOneToOne: false;
            referencedRelation: "clinic_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_slots_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_slots_practitioner_role_id_fkey";
            columns: ["practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_type: string | null;
          cancellation_reason: string | null;
          clinic_service_id: string | null;
          created_at: string;
          description: string | null;
          end_at: string | null;
          id: string;
          minutes_duration: number | null;
          organization_id: string;
          patient_id: string;
          patient_instruction: string | null;
          practitioner_role_id: string | null;
          queue_date: string | null;
          queue_number: number | null;
          reason_codes: Json;
          service_category: string | null;
          service_type: string | null;
          specialty: string | null;
          start_at: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          appointment_type?: string | null;
          cancellation_reason?: string | null;
          clinic_service_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_at?: string | null;
          id?: string;
          minutes_duration?: number | null;
          organization_id: string;
          patient_id: string;
          patient_instruction?: string | null;
          practitioner_role_id?: string | null;
          queue_date?: string | null;
          queue_number?: number | null;
          reason_codes?: Json;
          service_category?: string | null;
          service_type?: string | null;
          specialty?: string | null;
          start_at?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          appointment_type?: string | null;
          cancellation_reason?: string | null;
          clinic_service_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_at?: string | null;
          id?: string;
          minutes_duration?: number | null;
          organization_id?: string;
          patient_id?: string;
          patient_instruction?: string | null;
          practitioner_role_id?: string | null;
          queue_date?: string | null;
          queue_number?: number | null;
          reason_codes?: Json;
          service_category?: string | null;
          service_type?: string | null;
          specialty?: string | null;
          start_at?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_service_id_fkey";
            columns: ["clinic_service_id"];
            isOneToOne: false;
            referencedRelation: "clinic_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_practitioner_role_id_fkey";
            columns: ["practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          id: string;
          metadata: Json;
          occurred_at: string;
          organization_id: string | null;
          record_id: string;
          table_name: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          organization_id?: string | null;
          record_id: string;
          table_name: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          organization_id?: string | null;
          record_id?: string;
          table_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          billable_period_end: string | null;
          billable_period_start: string | null;
          claim_type: string;
          coverage_id: string | null;
          created_at: string;
          encounter_id: string | null;
          id: string;
          items: Json;
          organization_id: string;
          patient_id: string;
          priority_code: string | null;
          provider_organization_id: string | null;
          status: Database["public"]["Enums"]["claim_status"];
          total: number | null;
          updated_at: string;
          use: string;
        };
        Insert: {
          billable_period_end?: string | null;
          billable_period_start?: string | null;
          claim_type: string;
          coverage_id?: string | null;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          items?: Json;
          organization_id: string;
          patient_id: string;
          priority_code?: string | null;
          provider_organization_id?: string | null;
          status?: Database["public"]["Enums"]["claim_status"];
          total?: number | null;
          updated_at?: string;
          use?: string;
        };
        Update: {
          billable_period_end?: string | null;
          billable_period_start?: string | null;
          claim_type?: string;
          coverage_id?: string | null;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          items?: Json;
          organization_id?: string;
          patient_id?: string;
          priority_code?: string | null;
          provider_organization_id?: string | null;
          status?: Database["public"]["Enums"]["claim_status"];
          total?: number | null;
          updated_at?: string;
          use?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claims_coverage_id_fkey";
            columns: ["coverage_id"];
            isOneToOne: false;
            referencedRelation: "coverages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_provider_organization_id_fkey";
            columns: ["provider_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_services: {
        Row: {
          active: boolean;
          base_price: number | null;
          booking_enabled: boolean;
          code: string;
          created_at: string;
          currency: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          name: string;
          organization_id: string;
          owner_practitioner_role_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          base_price?: number | null;
          booking_enabled?: boolean;
          code: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name: string;
          organization_id: string;
          owner_practitioner_role_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          base_price?: number | null;
          booking_enabled?: boolean;
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name?: string;
          organization_id?: string;
          owner_practitioner_role_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_services_owner_practitioner_role_id_fkey";
            columns: ["owner_practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      coverages: {
        Row: {
          beneficiary_relationship: string | null;
          class_values: Json;
          coverage_type: string;
          created_at: string;
          id: string;
          organization_id: string;
          patient_id: string;
          payor: Json;
          period_end: string | null;
          period_start: string | null;
          status: string;
          subscriber_id: string | null;
          updated_at: string;
        };
        Insert: {
          beneficiary_relationship?: string | null;
          class_values?: Json;
          coverage_type: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          patient_id: string;
          payor: Json;
          period_end?: string | null;
          period_start?: string | null;
          status: string;
          subscriber_id?: string | null;
          updated_at?: string;
        };
        Update: {
          beneficiary_relationship?: string | null;
          class_values?: Json;
          coverage_type?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          patient_id?: string;
          payor?: Json;
          period_end?: string | null;
          period_start?: string | null;
          status?: string;
          subscriber_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coverages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coverages_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      department_stock: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          item_id: string;
          organization_id: string;
          quantity: number;
          reorder_level: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          item_id: string;
          organization_id: string;
          quantity?: number;
          reorder_level?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          item_id?: string;
          organization_id?: string;
          quantity?: number;
          reorder_level?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_stock_department_id_organization_id_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "department_stock_item_id_organization_id_fkey";
            columns: ["item_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "department_stock_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      diagnostic_reports: {
        Row: {
          based_on_service_request_id: string | null;
          category_codes: Json;
          code: string;
          code_display: string | null;
          conclusion: string | null;
          conclusion_codes: Json;
          created_at: string;
          effective_at: string | null;
          encounter_id: string | null;
          id: string;
          issued_at: string | null;
          organization_id: string;
          patient_id: string;
          performer_organization_id: string | null;
          presented_form: Json;
          status: Database["public"]["Enums"]["diagnostic_report_status"];
          updated_at: string;
        };
        Insert: {
          based_on_service_request_id?: string | null;
          category_codes?: Json;
          code: string;
          code_display?: string | null;
          conclusion?: string | null;
          conclusion_codes?: Json;
          created_at?: string;
          effective_at?: string | null;
          encounter_id?: string | null;
          id?: string;
          issued_at?: string | null;
          organization_id: string;
          patient_id: string;
          performer_organization_id?: string | null;
          presented_form?: Json;
          status?: Database["public"]["Enums"]["diagnostic_report_status"];
          updated_at?: string;
        };
        Update: {
          based_on_service_request_id?: string | null;
          category_codes?: Json;
          code?: string;
          code_display?: string | null;
          conclusion?: string | null;
          conclusion_codes?: Json;
          created_at?: string;
          effective_at?: string | null;
          encounter_id?: string | null;
          id?: string;
          issued_at?: string | null;
          organization_id?: string;
          patient_id?: string;
          performer_organization_id?: string | null;
          presented_form?: Json;
          status?: Database["public"]["Enums"]["diagnostic_report_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "diagnostic_reports_based_on_service_request_id_fkey";
            columns: ["based_on_service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnostic_reports_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnostic_reports_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnostic_reports_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnostic_reports_performer_organization_id_fkey";
            columns: ["performer_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_references: {
        Row: {
          author_practitioner_id: string | null;
          category_codes: Json;
          content_title: string | null;
          content_type: string;
          content_url: string;
          created_at: string;
          date_at: string;
          description: string | null;
          doc_status: string | null;
          encounter_id: string | null;
          id: string;
          organization_id: string;
          patient_id: string | null;
          status: Database["public"]["Enums"]["document_reference_status"];
          type_code: string;
          type_display: string | null;
          updated_at: string;
        };
        Insert: {
          author_practitioner_id?: string | null;
          category_codes?: Json;
          content_title?: string | null;
          content_type: string;
          content_url: string;
          created_at?: string;
          date_at?: string;
          description?: string | null;
          doc_status?: string | null;
          encounter_id?: string | null;
          id?: string;
          organization_id: string;
          patient_id?: string | null;
          status?: Database["public"]["Enums"]["document_reference_status"];
          type_code: string;
          type_display?: string | null;
          updated_at?: string;
        };
        Update: {
          author_practitioner_id?: string | null;
          category_codes?: Json;
          content_title?: string | null;
          content_type?: string;
          content_url?: string;
          created_at?: string;
          date_at?: string;
          description?: string | null;
          doc_status?: string | null;
          encounter_id?: string | null;
          id?: string;
          organization_id?: string;
          patient_id?: string | null;
          status?: Database["public"]["Enums"]["document_reference_status"];
          type_code?: string;
          type_display?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_references_author_practitioner_id_fkey";
            columns: ["author_practitioner_id"];
            isOneToOne: false;
            referencedRelation: "practitioners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_references_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_references_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_references_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      encounters: {
        Row: {
          appointment_id: string | null;
          assessment_note: string | null;
          class_code: string;
          created_at: string;
          diagnosis: Json;
          id: string;
          objective_note: string | null;
          organization_id: string;
          patient_id: string;
          period_end: string | null;
          period_start: string | null;
          plan_note: string | null;
          practitioner_role_id: string | null;
          reason_codes: Json;
          service_type: string | null;
          status: Database["public"]["Enums"]["encounter_status"];
          subject_note: string | null;
          type_codes: Json;
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          assessment_note?: string | null;
          class_code?: string;
          created_at?: string;
          diagnosis?: Json;
          id?: string;
          objective_note?: string | null;
          organization_id: string;
          patient_id: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_note?: string | null;
          practitioner_role_id?: string | null;
          reason_codes?: Json;
          service_type?: string | null;
          status?: Database["public"]["Enums"]["encounter_status"];
          subject_note?: string | null;
          type_codes?: Json;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          assessment_note?: string | null;
          class_code?: string;
          created_at?: string;
          diagnosis?: Json;
          id?: string;
          objective_note?: string | null;
          organization_id?: string;
          patient_id?: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_note?: string | null;
          practitioner_role_id?: string | null;
          reason_codes?: Json;
          service_type?: string | null;
          status?: Database["public"]["Enums"]["encounter_status"];
          subject_note?: string | null;
          type_codes?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_practitioner_role_id_fkey";
            columns: ["practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      hello_world: {
        Row: {
          created_at: string;
          id: string;
          message: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          active: boolean;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          sku: string;
          unit_of_measure: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          sku: string;
          unit_of_measure: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          sku?: string;
          unit_of_measure?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_stock_movements: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          item_id: string;
          movement_type: string;
          occurred_at: string;
          organization_id: string;
          quantity_delta: number;
          reason: string | null;
          recorded_by: string | null;
          stock_id: string;
          transfer_group_id: string | null;
          usage_id: string | null;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          item_id: string;
          movement_type: string;
          occurred_at?: string;
          organization_id: string;
          quantity_delta: number;
          reason?: string | null;
          recorded_by?: string | null;
          stock_id: string;
          transfer_group_id?: string | null;
          usage_id?: string | null;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          item_id?: string;
          movement_type?: string;
          occurred_at?: string;
          organization_id?: string;
          quantity_delta?: number;
          reason?: string | null;
          recorded_by?: string | null;
          stock_id?: string;
          transfer_group_id?: string | null;
          usage_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_department_id_organization_id_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_movements_item_id_organization_id_fkey";
            columns: ["item_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_stock_movements_stock_id_organization_id_fkey";
            columns: ["stock_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "department_stock";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_stock_movements_usage_id_fkey";
            columns: ["usage_id"];
            isOneToOne: false;
            referencedRelation: "inventory_usages";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_usages: {
        Row: {
          created_at: string;
          currency: string;
          department_id: string;
          encounter_id: string;
          id: string;
          item_id: string;
          organization_id: string;
          patient_id: string;
          quantity: number;
          stock_id: string;
          tagged_by: string;
          unit_price: number;
          used_at: string;
        };
        Insert: {
          created_at?: string;
          currency: string;
          department_id: string;
          encounter_id: string;
          id?: string;
          item_id: string;
          organization_id: string;
          patient_id: string;
          quantity: number;
          stock_id: string;
          tagged_by: string;
          unit_price: number;
          used_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          department_id?: string;
          encounter_id?: string;
          id?: string;
          item_id?: string;
          organization_id?: string;
          patient_id?: string;
          quantity?: number;
          stock_id?: string;
          tagged_by?: string;
          unit_price?: number;
          used_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_usages_department_id_organization_id_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_usages_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_usages_item_id_organization_id_fkey";
            columns: ["item_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "inventory_usages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_usages_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_usages_stock_id_organization_id_fkey";
            columns: ["stock_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "department_stock";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      medication_requests: {
        Row: {
          authored_on: string;
          category_codes: Json;
          created_at: string;
          dispense_request: Json | null;
          dosage_instruction: Json;
          encounter_id: string | null;
          id: string;
          intent: string;
          medication_code: string;
          medication_display: string | null;
          note: string | null;
          organization_id: string;
          patient_id: string;
          requester_practitioner_id: string | null;
          status: Database["public"]["Enums"]["request_status"];
          updated_at: string;
        };
        Insert: {
          authored_on?: string;
          category_codes?: Json;
          created_at?: string;
          dispense_request?: Json | null;
          dosage_instruction?: Json;
          encounter_id?: string | null;
          id?: string;
          intent?: string;
          medication_code: string;
          medication_display?: string | null;
          note?: string | null;
          organization_id: string;
          patient_id: string;
          requester_practitioner_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Update: {
          authored_on?: string;
          category_codes?: Json;
          created_at?: string;
          dispense_request?: Json | null;
          dosage_instruction?: Json;
          encounter_id?: string | null;
          id?: string;
          intent?: string;
          medication_code?: string;
          medication_display?: string | null;
          note?: string | null;
          organization_id?: string;
          patient_id?: string;
          requester_practitioner_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medication_requests_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medication_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medication_requests_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medication_requests_requester_practitioner_id_fkey";
            columns: ["requester_practitioner_id"];
            isOneToOne: false;
            referencedRelation: "practitioners";
            referencedColumns: ["id"];
          },
        ];
      };
      observations: {
        Row: {
          category_codes: Json;
          code: string;
          code_display: string | null;
          code_system: string | null;
          created_at: string;
          diagnostic_report_id: string | null;
          effective_at: string | null;
          encounter_id: string | null;
          id: string;
          interpretation_codes: Json;
          issued_at: string | null;
          note: string | null;
          organization_id: string;
          patient_id: string;
          performer_practitioner_id: string | null;
          reference_range: Json;
          status: Database["public"]["Enums"]["observation_status"];
          supersedes_id: string | null;
          updated_at: string;
          value: Json | null;
          value_unit: string | null;
        };
        Insert: {
          category_codes?: Json;
          code: string;
          code_display?: string | null;
          code_system?: string | null;
          created_at?: string;
          diagnostic_report_id?: string | null;
          effective_at?: string | null;
          encounter_id?: string | null;
          id?: string;
          interpretation_codes?: Json;
          issued_at?: string | null;
          note?: string | null;
          organization_id: string;
          patient_id: string;
          performer_practitioner_id?: string | null;
          reference_range?: Json;
          status?: Database["public"]["Enums"]["observation_status"];
          supersedes_id?: string | null;
          updated_at?: string;
          value?: Json | null;
          value_unit?: string | null;
        };
        Update: {
          category_codes?: Json;
          code?: string;
          code_display?: string | null;
          code_system?: string | null;
          created_at?: string;
          diagnostic_report_id?: string | null;
          effective_at?: string | null;
          encounter_id?: string | null;
          id?: string;
          interpretation_codes?: Json;
          issued_at?: string | null;
          note?: string | null;
          organization_id?: string;
          patient_id?: string;
          performer_practitioner_id?: string | null;
          reference_range?: Json;
          status?: Database["public"]["Enums"]["observation_status"];
          supersedes_id?: string | null;
          updated_at?: string;
          value?: Json | null;
          value_unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "observations_diagnostic_report_id_fkey";
            columns: ["diagnostic_report_id"];
            isOneToOne: false;
            referencedRelation: "diagnostic_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_performer_practitioner_id_fkey";
            columns: ["performer_practitioner_id"];
            isOneToOne: false;
            referencedRelation: "practitioners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          active: boolean;
          address: Json;
          created_at: string;
          id: string;
          identifier: Json;
          name: string;
          telecom: Json;
          type_codes: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          created_at?: string;
          id?: string;
          identifier?: Json;
          name: string;
          telecom?: Json;
          type_codes?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: Json;
          created_at?: string;
          id?: string;
          identifier?: Json;
          name?: string;
          telecom?: Json;
          type_codes?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      patient_clinic_contexts: {
        Row: {
          auth_user_id: string;
          created_at: string;
          id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_clinic_contexts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          active: boolean;
          address: Json;
          auth_user_id: string | null;
          birth_date: string | null;
          communication: Json;
          contact: Json;
          created_at: string;
          gender: string | null;
          id: string;
          identifier: Json;
          name: Json;
          organization_id: string;
          telecom: Json;
          updated_at: string;
          walk_in_failed_attempts: number;
          walk_in_id: string | null;
          walk_in_locked_until: string | null;
          walk_in_pin_hash: string | null;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          auth_user_id?: string | null;
          birth_date?: string | null;
          communication?: Json;
          contact?: Json;
          created_at?: string;
          gender?: string | null;
          id?: string;
          identifier?: Json;
          name: Json;
          organization_id: string;
          telecom?: Json;
          updated_at?: string;
          walk_in_failed_attempts?: number;
          walk_in_id?: string | null;
          walk_in_locked_until?: string | null;
          walk_in_pin_hash?: string | null;
        };
        Update: {
          active?: boolean;
          address?: Json;
          auth_user_id?: string | null;
          birth_date?: string | null;
          communication?: Json;
          contact?: Json;
          created_at?: string;
          gender?: string | null;
          id?: string;
          identifier?: Json;
          name?: Json;
          organization_id?: string;
          telecom?: Json;
          updated_at?: string;
          walk_in_failed_attempts?: number;
          walk_in_id?: string | null;
          walk_in_locked_until?: string | null;
          walk_in_pin_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "patients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          granted_by: string;
          id: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by: string;
          id?: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      practitioner_roles: {
        Row: {
          active: boolean;
          available_time: Json;
          created_at: string;
          id: string;
          not_available: Json;
          organization_id: string;
          practitioner_id: string;
          role_code: string;
          specialty_codes: Json;
          telecom: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          available_time?: Json;
          created_at?: string;
          id?: string;
          not_available?: Json;
          organization_id: string;
          practitioner_id: string;
          role_code: string;
          specialty_codes?: Json;
          telecom?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          available_time?: Json;
          created_at?: string;
          id?: string;
          not_available?: Json;
          organization_id?: string;
          practitioner_id?: string;
          role_code?: string;
          specialty_codes?: Json;
          telecom?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practitioner_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practitioner_roles_practitioner_id_fkey";
            columns: ["practitioner_id"];
            isOneToOne: false;
            referencedRelation: "practitioners";
            referencedColumns: ["id"];
          },
        ];
      };
      practitioners: {
        Row: {
          active: boolean;
          address: Json;
          auth_user_id: string | null;
          created_at: string;
          id: string;
          identifier: Json;
          name: Json;
          organization_id: string;
          qualification: Json;
          telecom: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: Json;
          auth_user_id?: string | null;
          created_at?: string;
          id?: string;
          identifier?: Json;
          name: Json;
          organization_id: string;
          qualification?: Json;
          telecom?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: Json;
          auth_user_id?: string | null;
          created_at?: string;
          id?: string;
          identifier?: Json;
          name?: Json;
          organization_id?: string;
          qualification?: Json;
          telecom?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practitioners_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_weekly_availability: {
        Row: {
          clinic_service_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: string;
          organization_id: string;
          practitioner_role_id: string;
          start_time: string;
          updated_at: string;
        };
        Insert: {
          clinic_service_id: string;
          created_at?: string;
          day_of_week: number;
          end_time: string;
          id?: string;
          organization_id: string;
          practitioner_role_id: string;
          start_time: string;
          updated_at?: string;
        };
        Update: {
          clinic_service_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          organization_id?: string;
          practitioner_role_id?: string;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_weekly_availability_clinic_service_id_fkey";
            columns: ["clinic_service_id"];
            isOneToOne: false;
            referencedRelation: "clinic_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_weekly_availability_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_weekly_availability_practitioner_role_id_fkey";
            columns: ["practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string | null;
          permission: string;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          permission: string;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          permission?: string;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_department_assignments: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          organization_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_department_assignments_department_id_organization_id_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_department_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      service_requests: {
        Row: {
          category: string;
          code: string;
          code_display: string | null;
          created_at: string;
          encounter_id: string | null;
          id: string;
          intent: string;
          note: string | null;
          occurrence_end: string | null;
          occurrence_start: string | null;
          organization_id: string;
          patient_id: string;
          performer_organization_id: string | null;
          performer_practitioner_role_id: string | null;
          priority: string | null;
          reason_codes: Json;
          requester_practitioner_id: string | null;
          status: Database["public"]["Enums"]["request_status"];
          supporting_info: Json;
          updated_at: string;
        };
        Insert: {
          category: string;
          code: string;
          code_display?: string | null;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          intent?: string;
          note?: string | null;
          occurrence_end?: string | null;
          occurrence_start?: string | null;
          organization_id: string;
          patient_id: string;
          performer_organization_id?: string | null;
          performer_practitioner_role_id?: string | null;
          priority?: string | null;
          reason_codes?: Json;
          requester_practitioner_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          supporting_info?: Json;
          updated_at?: string;
        };
        Update: {
          category?: string;
          code?: string;
          code_display?: string | null;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          intent?: string;
          note?: string | null;
          occurrence_end?: string | null;
          occurrence_start?: string | null;
          organization_id?: string;
          patient_id?: string;
          performer_organization_id?: string | null;
          performer_practitioner_role_id?: string | null;
          priority?: string | null;
          reason_codes?: Json;
          requester_practitioner_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          supporting_info?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_performer_organization_id_fkey";
            columns: ["performer_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_performer_practitioner_role_id_fkey";
            columns: ["performer_practitioner_role_id"];
            isOneToOne: false;
            referencedRelation: "practitioner_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_requester_practitioner_id_fkey";
            columns: ["requester_practitioner_id"];
            isOneToOne: false;
            referencedRelation: "practitioners";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      waiting_room_queue: {
        Row: {
          appointment_id: string;
          id: string;
          organization_id: string;
          queue_date: string;
          queue_number: number;
          scheduled_at: string;
          service_name: string;
          stage: Database["public"]["Enums"]["waiting_queue_stage"];
          updated_at: string;
        };
        Insert: {
          appointment_id: string;
          id?: string;
          organization_id: string;
          queue_date: string;
          queue_number: number;
          scheduled_at: string;
          service_name: string;
          stage?: Database["public"]["Enums"]["waiting_queue_stage"];
          updated_at?: string;
        };
        Update: {
          appointment_id?: string;
          id?: string;
          organization_id?: string;
          queue_date?: string;
          queue_number?: number;
          scheduled_at?: string;
          service_name?: string;
          stage?: Database["public"]["Enums"]["waiting_queue_stage"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waiting_room_queue_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waiting_room_queue_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_soap_note: {
        Args: {
          p_encounter_id: string;
          p_supersedes_id?: string;
          p_text: string;
        };
        Returns: string;
      };
      add_soap_observation: {
        Args: {
          p_encounter_id: string;
          p_section: string;
          p_supersedes_id?: string;
          p_text: string;
        };
        Returns: string;
      };
      adjust_department_stock: {
        Args: {
          p_department_id: string;
          p_item_id: string;
          p_movement_type?: string;
          p_quantity_delta: number;
          p_reason: string;
        };
        Returns: string;
      };
      book_appointment_slot: {
        Args: { p_patient_id?: string; p_slot_id: string };
        Returns: string;
      };
      can_access_organization: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      can_manage_organization_accounts: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      assign_staff_department: {
        Args: {
          p_department_id: string | null;
          p_organization_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      claim_walk_in_patient: {
        Args: {
          p_organization_id: string;
          p_pin: string;
          p_walk_in_id: string;
        };
        Returns: string;
      };
      create_appointment_slot: {
        Args: {
          p_clinic_service_id: string;
          p_end_at: string;
          p_start_at: string;
        };
        Returns: string;
      };
      create_appointment_slot_range: {
        Args: {
          p_clinic_service_id: string;
          p_end_at: string;
          p_start_at: string;
        };
        Returns: number;
      };
      create_walk_in_patient: {
        Args: {
          p_birth_date?: string;
          p_gender?: string;
          p_name: Json;
          p_organization_id: string;
          p_telecom?: Json;
        };
        Returns: {
          patient_id: string;
          pin: string;
          walk_in_id: string;
        }[];
      };
      enroll_patient_at_clinic: {
        Args: { p_display_name: string; p_organization_id: string };
        Returns: string;
      };
      finish_clinical_encounter: {
        Args: { p_encounter_id: string };
        Returns: undefined;
      };
      get_current_practitioner: {
        Args: { p_organization_id: string; p_roles: string[] };
        Returns: string;
      };
      get_current_provider_role_id: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      get_current_staff_organization: { Args: never; Returns: string };
      get_current_staff_department: {
        Args: { p_organization_id: string };
        Returns: string | null;
      };
      get_portal_access: {
        Args: { p_portal: string };
        Returns: {
          is_allowed: boolean;
          is_superadmin: boolean;
          organization_ids: string[];
          role_codes: string[];
        }[];
      };
      has_organization_permission: {
        Args: { target_organization_id: string; target_permission: string };
        Returns: boolean;
      };
      has_organization_role: {
        Args: { allowed_roles: string[]; target_organization_id: string };
        Returns: boolean;
      };
      is_active_staff: { Args: never; Returns: boolean };
      is_any_owner: { Args: never; Returns: boolean };
      is_patient_self: {
        Args: { target_organization_id: string; target_patient_id: string };
        Returns: boolean;
      };
      is_superadmin: { Args: never; Returns: boolean };
      is_walk_in_patient: {
        Args: { target_organization_id: string; target_patient_id: string };
        Returns: boolean;
      };
      issue_medical_certificate: {
        Args: { p_encounter_id: string; p_statement: string; p_title: string };
        Returns: string;
      };
      issue_prescription: {
        Args: {
          p_dosage: string;
          p_encounter_id: string;
          p_medication: string;
          p_note?: string;
        };
        Returns: string;
      };
      list_inventory_encounters: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          period_start: string;
          service_type: string;
        }[];
      };
      list_clinic_staff: {
        Args: { p_organization_id: string };
        Returns: {
          active: boolean;
          department_id: string | null;
          display_name: string;
          email: string | null;
          role_code: string;
          user_id: string;
        }[];
      };
      list_staff_departments: {
        Args: { p_organization_id: string };
        Returns: {
          active: boolean;
          code: string;
          id: string;
          name: string;
        }[];
      };
      retire_provider_clinic_service: {
        Args: { p_service_id: string };
        Returns: undefined;
      };
      record_triage_vital_signs: {
        Args: {
          p_acuity?: string;
          p_appointment_id: string;
          p_chief_complaint?: string;
          p_diastolic_bp: number;
          p_height_cm?: number;
          p_notes?: string;
          p_oxygen_saturation: number;
          p_pain_score?: number;
          p_pulse_bpm: number;
          p_respiratory_rate: number;
          p_supersedes_id?: string;
          p_systolic_bp: number;
          p_temperature_c: number;
          p_weight_kg?: number;
        };
        Returns: string;
      };
      list_clinic_role_definitions: {
        Args: { p_organization_id: string };
        Returns: {
          code: string;
          is_custom: boolean;
          name: string;
          permissions: string[];
        }[];
      };
      save_provider_clinic_service: {
        Args: {
          p_base_price: number;
          p_booking_enabled: boolean;
          p_code: string;
          p_description: string;
          p_duration_minutes: number;
          p_name: string;
          p_organization_id: string;
          p_service_id: string;
        };
        Returns: string;
      };
      save_clinic_role_definition: {
        Args: {
          p_code: string;
          p_name: string;
          p_organization_id: string;
          p_permissions: string[];
        };
        Returns: undefined;
      };
      save_provider_weekly_availability: {
        Args: { p_clinic_service_id: string; p_windows: Json };
        Returns: number;
      };
      set_appointment_slot_unavailable: {
        Args: { p_slot_id: string; p_unavailable: boolean };
        Returns: undefined;
      };
      set_patient_clinic_context: {
        Args: { p_organization_id: string };
        Returns: undefined;
      };
      start_appointment_encounter: {
        Args: { p_appointment_id: string };
        Returns: string;
      };
      tag_inventory_usage: {
        Args: {
          p_department_id?: string | null;
          p_encounter_id: string;
          p_quantity: number;
          p_stock_id: string;
        };
        Returns: string;
      };
      transfer_department_stock: {
        Args: {
          p_from_department_id: string;
          p_item_id: string;
          p_quantity: number;
          p_reason: string;
          p_to_department_id: string;
        };
        Returns: string;
      };
      update_appointment_status: {
        Args: {
          p_appointment_id: string;
          p_status: Database["public"]["Enums"]["appointment_status"];
        };
        Returns: undefined;
      };
      update_own_patient_profile: {
        Args: {
          p_address: string;
          p_birth_date: string;
          p_display_name: string;
          p_gender: string;
          p_patient_id: string;
          p_phone: string;
        };
        Returns: undefined;
      };
      verify_walk_in_patient: {
        Args: {
          p_organization_id: string;
          p_pin: string;
          p_walk_in_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      appointment_status:
        | "proposed"
        | "pending"
        | "booked"
        | "arrived"
        | "fulfilled"
        | "cancelled"
        | "noshow";
      claim_status: "active" | "cancelled" | "draft" | "entered_in_error";
      diagnostic_report_status:
        | "registered"
        | "partial"
        | "preliminary"
        | "final"
        | "amended"
        | "corrected"
        | "appended"
        | "cancelled"
        | "entered_in_error"
        | "unknown";
      document_reference_status: "current" | "superseded" | "entered_in_error";
      encounter_status:
        | "planned"
        | "arrived"
        | "in_progress"
        | "onleave"
        | "finished"
        | "cancelled"
        | "entered_in_error"
        | "unknown";
      observation_status:
        | "registered"
        | "preliminary"
        | "final"
        | "amended"
        | "corrected"
        | "cancelled"
        | "entered_in_error"
        | "unknown";
      request_status:
        | "draft"
        | "active"
        | "on_hold"
        | "revoked"
        | "completed"
        | "entered_in_error"
        | "unknown";
      slot_status:
        | "busy"
        | "free"
        | "busy_unavailable"
        | "busy_tentative"
        | "entered_in_error";
      waiting_queue_stage:
        | "scheduled"
        | "waiting"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "noshow";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: [
        "proposed",
        "pending",
        "booked",
        "arrived",
        "fulfilled",
        "cancelled",
        "noshow",
      ],
      claim_status: ["active", "cancelled", "draft", "entered_in_error"],
      diagnostic_report_status: [
        "registered",
        "partial",
        "preliminary",
        "final",
        "amended",
        "corrected",
        "appended",
        "cancelled",
        "entered_in_error",
        "unknown",
      ],
      document_reference_status: ["current", "superseded", "entered_in_error"],
      encounter_status: [
        "planned",
        "arrived",
        "in_progress",
        "onleave",
        "finished",
        "cancelled",
        "entered_in_error",
        "unknown",
      ],
      observation_status: [
        "registered",
        "preliminary",
        "final",
        "amended",
        "corrected",
        "cancelled",
        "entered_in_error",
        "unknown",
      ],
      request_status: [
        "draft",
        "active",
        "on_hold",
        "revoked",
        "completed",
        "entered_in_error",
        "unknown",
      ],
      slot_status: [
        "busy",
        "free",
        "busy_unavailable",
        "busy_tentative",
        "entered_in_error",
      ],
      waiting_queue_stage: [
        "scheduled",
        "waiting",
        "in_progress",
        "completed",
        "cancelled",
        "noshow",
      ],
    },
  },
} as const;
