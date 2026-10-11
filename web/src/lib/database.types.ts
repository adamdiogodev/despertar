
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "announcements": {
                  Row: {
                    "audience": Database["public"]['Enums']["announcement_audience"],"body": string,"created_at": string,"created_by": string | null,"id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: Database["public"]['Enums']["announcement_audience"],"body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"title": string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["announcement_audience"],"body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "cancel_reason": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"family_confirmation": string | null,"family_confirmation_note": string | null,"family_confirmed_at": string | null,"family_confirmed_by": string | null,"id": string,"notes": string | null,"patient_id": string,"room_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"therapist_id": string,"therapy_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"family_confirmation"?: string | null,"family_confirmation_note"?: string | null,"family_confirmed_at"?: string | null,"family_confirmed_by"?: string | null,"id"?: string,"notes"?: string | null,"patient_id": string,"room_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"therapist_id": string,"therapy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"family_confirmation"?: string | null,"family_confirmation_note"?: string | null,"family_confirmed_at"?: string | null,"family_confirmed_by"?: string | null,"id"?: string,"notes"?: string | null,"patient_id"?: string,"room_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"therapist_id"?: string,"therapy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_family_confirmed_by_fkey"
      columns: ["family_confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_therapy_id_fkey"
      columns: ["therapy_id"]
isOneToOne: false
      referencedRelation: "therapies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"changed_columns": (string)[] | null,"created_at": string,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changed_columns"?: (string)[] | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changed_columns"?: (string)[] | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"care_assignments": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"frequency": string | null,"id": string,"patient_id": string,"starts_on": string,"therapist_id": string,"therapy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"frequency"?: string | null,"id"?: string,"patient_id": string,"starts_on"?: string,"therapist_id": string,"therapy_id": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"frequency"?: string | null,"id"?: string,"patient_id"?: string,"starts_on"?: string,"therapist_id"?: string,"therapy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "care_assignments_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "care_assignments_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "care_assignments_therapy_id_fkey"
      columns: ["therapy_id"]
isOneToOne: false
      referencedRelation: "therapies"
      referencedColumns: ["id"]
    }
                  ]
                },"charges": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"due_date": string,"family_id": string,"id": string,"paid_at": string | null,"payment_method": string,"receipt_path": string | null,"receipt_uploaded_at": string | null,"receipt_uploaded_by": string | null,"reference": string,"status": Database["public"]['Enums']["charge_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"due_date": string,"family_id": string,"id"?: string,"paid_at"?: string | null,"payment_method"?: string,"receipt_path"?: string | null,"receipt_uploaded_at"?: string | null,"receipt_uploaded_by"?: string | null,"reference": string,"status"?: Database["public"]['Enums']["charge_status"]
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"due_date"?: string,"family_id"?: string,"id"?: string,"paid_at"?: string | null,"payment_method"?: string,"receipt_path"?: string | null,"receipt_uploaded_at"?: string | null,"receipt_uploaded_by"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["charge_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_receipt_uploaded_by_fkey"
      columns: ["receipt_uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clinic_settings": {
                  Row: {
                    "address": string | null,"email": string | null,"id": number,"name": string,"phone": string | null,"reschedule_min_hours": number,"tax_id": string | null,"updated_at": string,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"email"?: string | null,"id"?: number,"name"?: string,"phone"?: string | null,"reschedule_min_hours"?: number,"tax_id"?: string | null,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"email"?: string | null,"id"?: number,"name"?: string,"phone"?: string | null,"reschedule_min_hours"?: number,"tax_id"?: string | null,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"conversation_participants": {
                  Row: {
                    "conversation_id": string,"last_read_at": string | null,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"last_read_at"?: string | null,"profile_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"last_read_at"?: string | null,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_participants_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_participants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"id": string,"last_message_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_message_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_message_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"documents": {
                  Row: {
                    "category": Database["public"]['Enums']["document_category"],"created_at": string,"family_id": string | null,"file_path": string,"id": string,"mime_type": string | null,"patient_id": string | null,"size_bytes": number | null,"status": Database["public"]['Enums']["document_status"],"therapist_id": string | null,"title": string,"uploaded_by": string | null,"visible_to_family": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: Database["public"]['Enums']["document_category"],"created_at"?: string,"family_id"?: string | null,"file_path": string,"id"?: string,"mime_type"?: string | null,"patient_id"?: string | null,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"therapist_id"?: string | null,"title": string,"uploaded_by"?: string | null,"visible_to_family"?: boolean
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["document_category"],"created_at"?: string,"family_id"?: string | null,"file_path"?: string,"id"?: string,"mime_type"?: string | null,"patient_id"?: string | null,"size_bytes"?: number | null,"status"?: Database["public"]['Enums']["document_status"],"therapist_id"?: string | null,"title"?: string,"uploaded_by"?: string | null,"visible_to_family"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"families": {
                  Row: {
                    "address": string | null,"created_at": string,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"emergency_contact_relationship": string | null,"id": string,"name": string,"status": Database["public"]['Enums']["record_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"emergency_contact_relationship"?: string | null,"id"?: string,"name": string,"status"?: Database["public"]['Enums']["record_status"]
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"emergency_contact_relationship"?: string | null,"id"?: string,"name"?: string,"status"?: Database["public"]['Enums']["record_status"]
                  }
                  Relationships: [
                    
                  ]
                },"family_internal_notes": {
                  Row: {
                    "family_id": string,"notes": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "family_id": string,"notes"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "family_id"?: string,"notes"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "family_internal_notes_family_id_fkey"
      columns: ["family_id"]
isOneToOne: true
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_internal_notes_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"guardian_requests": {
                  Row: {
                    "created_at": string,"family_id": string,"id": string,"message": string,"patient_id": string | null,"request_type": Database["public"]['Enums']["guardian_request_type"],"requested_by": string,"responded_at": string | null,"responded_by": string | null,"response": string | null,"status": Database["public"]['Enums']["guardian_request_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"family_id": string,"id"?: string,"message": string,"patient_id"?: string | null,"request_type": Database["public"]['Enums']["guardian_request_type"],"requested_by": string,"responded_at"?: string | null,"responded_by"?: string | null,"response"?: string | null,"status"?: Database["public"]['Enums']["guardian_request_status"]
                  }
                  Update: {
                    "created_at"?: string,"family_id"?: string,"id"?: string,"message"?: string,"patient_id"?: string | null,"request_type"?: Database["public"]['Enums']["guardian_request_type"],"requested_by"?: string,"responded_at"?: string | null,"responded_by"?: string | null,"response"?: string | null,"status"?: Database["public"]['Enums']["guardian_request_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardian_requests_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guardian_requests_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guardian_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guardian_requests_responded_by_fkey"
      columns: ["responded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "family_id": string,"is_primary": boolean,"profile_id": string,"relationship": string
                  }
                  ComputedFields: never
                  Insert: {
                    "family_id": string,"is_primary"?: boolean,"profile_id": string,"relationship"?: string
                  }
                  Update: {
                    "family_id"?: string,"is_primary"?: boolean,"profile_id"?: string,"relationship"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guardians_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_request_items": {
                  Row: {
                    "amount_cents": number,"appointment_id": string,"invoice_request_id": string,"minutes": number,"pay_model": Database["public"]['Enums']["pay_model"],"rate_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"appointment_id": string,"invoice_request_id": string,"minutes": number,"pay_model": Database["public"]['Enums']["pay_model"],"rate_cents": number
                  }
                  Update: {
                    "amount_cents"?: number,"appointment_id"?: string,"invoice_request_id"?: string,"minutes"?: number,"pay_model"?: Database["public"]['Enums']["pay_model"],"rate_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_request_items_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: true
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_request_items_invoice_request_id_fkey"
      columns: ["invoice_request_id"]
isOneToOne: false
      referencedRelation: "invoice_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_requests": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"invoice_file_path": string | null,"invoice_number": string | null,"paid_at": string | null,"payment_receipt_path": string | null,"period_id": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sessions_count": number,"status": Database["public"]['Enums']["invoice_status"],"submitted_at": string | null,"therapist_id": string,"therapy_id": string | null,"total_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"invoice_file_path"?: string | null,"invoice_number"?: string | null,"paid_at"?: string | null,"payment_receipt_path"?: string | null,"period_id"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sessions_count"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string | null,"therapist_id": string,"therapy_id"?: string | null,"total_minutes"?: number
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"invoice_file_path"?: string | null,"invoice_number"?: string | null,"paid_at"?: string | null,"payment_receipt_path"?: string | null,"period_id"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sessions_count"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string | null,"therapist_id"?: string,"therapy_id"?: string | null,"total_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_requests_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_requests_payee_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_requests_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "payout_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_requests_therapy_id_fkey"
      columns: ["therapy_id"]
isOneToOne: false
      referencedRelation: "therapies"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"id": string,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"id"?: string,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"patients": {
                  Row: {
                    "birth_date": string | null,"care_started_on": string | null,"created_at": string,"diagnosis": string | null,"family_id": string,"full_name": string,"id": string,"insurance_name": string,"insurance_number": string | null,"school": string | null,"status": Database["public"]['Enums']["record_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_date"?: string | null,"care_started_on"?: string | null,"created_at"?: string,"diagnosis"?: string | null,"family_id": string,"full_name": string,"id"?: string,"insurance_name"?: string,"insurance_number"?: string | null,"school"?: string | null,"status"?: Database["public"]['Enums']["record_status"]
                  }
                  Update: {
                    "birth_date"?: string | null,"care_started_on"?: string | null,"created_at"?: string,"diagnosis"?: string | null,"family_id"?: string,"full_name"?: string,"id"?: string,"insurance_name"?: string,"insurance_number"?: string | null,"school"?: string | null,"status"?: Database["public"]['Enums']["record_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "patients_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_periods": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_on": string,"id": string,"label": string,"starts_on": string,"status": Database["public"]['Enums']["payout_period_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on": string,"id"?: string,"label": string,"starts_on": string,"status"?: Database["public"]['Enums']["payout_period_status"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_on"?: string,"id"?: string,"label"?: string,"starts_on"?: string,"status"?: Database["public"]['Enums']["payout_period_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_periods_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_notes": {
                  Row: {
                    "content": string,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: string,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: string,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_notes_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string,"full_name": string,"id": string,"last_seen_at": string | null,"phone": string | null,"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email": string,"full_name": string,"id": string,"last_seen_at"?: string | null,"phone"?: string | null,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"last_seen_at"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"created_by": string | null,"due_date": string | null,"file_path": string | null,"id": string,"patient_id": string,"reference_label": string,"report_type": Database["public"]['Enums']["report_type"],"return_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["report_status"],"submitted_at": string | null,"therapist_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"file_path"?: string | null,"id"?: string,"patient_id": string,"reference_label": string,"report_type": Database["public"]['Enums']["report_type"],"return_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"submitted_at"?: string | null,"therapist_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"file_path"?: string | null,"id"?: string,"patient_id"?: string,"reference_label"?: string,"report_type"?: Database["public"]['Enums']["report_type"],"return_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"submitted_at"?: string | null,"therapist_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    }
                  ]
                },"reschedule_requests": {
                  Row: {
                    "appointment_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"proposed_starts_at": string,"reason": string,"requested_by": string,"status": Database["public"]['Enums']["request_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"proposed_starts_at": string,"reason": string,"requested_by": string,"status"?: Database["public"]['Enums']["request_status"]
                  }
                  Update: {
                    "appointment_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"proposed_starts_at"?: string,"reason"?: string,"requested_by"?: string,"status"?: Database["public"]['Enums']["request_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reschedule_requests_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reschedule_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reschedule_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "active": boolean,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"session_attachments": {
                  Row: {
                    "created_at": string,"file_name": string,"file_path": string,"id": string,"mime_type": string | null,"session_note_id": string,"size_bytes": number | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"file_path": string,"id"?: string,"mime_type"?: string | null,"session_note_id": string,"size_bytes"?: number | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"file_path"?: string,"id"?: string,"mime_type"?: string | null,"session_note_id"?: string,"size_bytes"?: number | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_attachments_session_note_id_fkey"
      columns: ["session_note_id"]
isOneToOne: false
      referencedRelation: "session_notes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"session_notes": {
                  Row: {
                    "appointment_id": string | null,"content": string,"created_at": string,"id": string,"patient_id": string,"session_date": string,"therapist_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"content": string,"created_at"?: string,"id"?: string,"patient_id": string,"session_date"?: string,"therapist_id": string,"updated_at"?: string
                  }
                  Update: {
                    "appointment_id"?: string | null,"content"?: string,"created_at"?: string,"id"?: string,"patient_id"?: string,"session_date"?: string,"therapist_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_notes_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: true
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_notes_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_notes_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    }
                  ]
                },"signature_requests": {
                  Row: {
                    "created_at": string,"document_id": string,"due_date": string | null,"id": string,"requested_by": string | null,"signed_at": string | null,"signer_id": string,"signer_ip": string | null,"signer_user_agent": string | null,"status": Database["public"]['Enums']["signature_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"due_date"?: string | null,"id"?: string,"requested_by"?: string | null,"signed_at"?: string | null,"signer_id": string,"signer_ip"?: string | null,"signer_user_agent"?: string | null,"status"?: Database["public"]['Enums']["signature_status"]
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"due_date"?: string | null,"id"?: string,"requested_by"?: string | null,"signed_at"?: string | null,"signer_id"?: string,"signer_ip"?: string | null,"signer_user_agent"?: string | null,"status"?: Database["public"]['Enums']["signature_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "signature_requests_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signature_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signature_requests_signer_id_fkey"
      columns: ["signer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assigned_to": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"id": string,"patient_id": string | null,"priority": Database["public"]['Enums']["task_priority"],"status": Database["public"]['Enums']["task_status"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to": string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"patient_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"status"?: Database["public"]['Enums']["task_status"],"title": string
                  }
                  Update: {
                    "assigned_to"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"patient_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"status"?: Database["public"]['Enums']["task_status"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"therapies": {
                  Row: {
                    "active": boolean,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"therapist_rates": {
                  Row: {
                    "amount_cents": number,"created_at": string,"id": string,"pay_model": Database["public"]['Enums']["pay_model"],"therapist_id": string,"therapy_id": string,"valid_from": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"id"?: string,"pay_model": Database["public"]['Enums']["pay_model"],"therapist_id": string,"therapy_id": string,"valid_from"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"id"?: string,"pay_model"?: Database["public"]['Enums']["pay_model"],"therapist_id"?: string,"therapy_id"?: string,"valid_from"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "therapist_rates_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "therapist_rates_therapy_id_fkey"
      columns: ["therapy_id"]
isOneToOne: false
      referencedRelation: "therapies"
      referencedColumns: ["id"]
    }
                  ]
                },"therapists": {
                  Row: {
                    "color": string,"council_registry": string | null,"id": string,"specialty": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"council_registry"?: string | null,"id": string,"specialty": string
                  }
                  Update: {
                    "color"?: string,"council_registry"?: string | null,"id"?: string,"specialty"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "therapists_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"treatment_plans": {
                  Row: {
                    "care_type": string | null,"chief_complaint": string | null,"created_at": string,"estimated_duration": string | null,"frequency": string | null,"goals": string | null,"home_guidance": string | null,"id": string,"important_notes": string | null,"is_draft": boolean,"materials": string | null,"patient_id": string,"session_minutes": number | null,"strategies": string | null,"therapist_id": string,"therapy_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "care_type"?: string | null,"chief_complaint"?: string | null,"created_at"?: string,"estimated_duration"?: string | null,"frequency"?: string | null,"goals"?: string | null,"home_guidance"?: string | null,"id"?: string,"important_notes"?: string | null,"is_draft"?: boolean,"materials"?: string | null,"patient_id": string,"session_minutes"?: number | null,"strategies"?: string | null,"therapist_id": string,"therapy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "care_type"?: string | null,"chief_complaint"?: string | null,"created_at"?: string,"estimated_duration"?: string | null,"frequency"?: string | null,"goals"?: string | null,"home_guidance"?: string | null,"id"?: string,"important_notes"?: string | null,"is_draft"?: boolean,"materials"?: string | null,"patient_id"?: string,"session_minutes"?: number | null,"strategies"?: string | null,"therapist_id"?: string,"therapy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "treatment_plans_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treatment_plans_therapist_id_fkey"
      columns: ["therapist_id"]
isOneToOne: false
      referencedRelation: "therapists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treatment_plans_therapy_id_fkey"
      columns: ["therapy_id"]
isOneToOne: false
      referencedRelation: "therapies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "attach_charge_receipt":
{ Args: { "path": string,"target_charge": string }; Returns: undefined
                           },
"attach_payout_receipt":
{ Args: { "path": string,"target_request": string }; Returns: undefined
                           },
"can_message":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"can_see_profile":
{ Args: { "target": string }; Returns: boolean
                           },
"compute_session_amount":
{ Args: { "minutes": number,"model": Database["public"]['Enums']["pay_model"],"rate_cents": number }; Returns: number
                           },
"create_manual_invoice_request":
{ Args: { "amount": number,"payee": string,"request_description": string }; Returns: string
                           },
"current_app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"decide_reschedule":
{ Args: { "approve": boolean,"note"?: string,"target_request": string }; Returns: undefined
                           },
"format_brl":
{ Args: { "cents": number }; Returns: string
                           },
"format_local":
{ Args: { "ts": string }; Returns: string
                           },
"generate_invoice_requests":
{ Args: { "target_period": string }; Returns: {
              "amount_cents": number,"missing_rate": boolean,"sessions": number,"therapist_id": string,"therapy_id": string
            }[]
                           },
"get_family_guidance":
{ Args: { "target_patient": string }; Returns: {
              "home_guidance": string,"materials": string,"therapist_name": string,"therapy": string,"updated_at": string
            }[]
                           },
"global_search":
{ Args: { "term": string }; Returns: {
              "id": string,"kind": string,"subtitle": string,"title": string
            }[]
                           },
"guardian_cancel_appointment":
{ Args: { "cancel_reason_text": string,"target_appointment": string }; Returns: undefined
                           },
"has_role":
{ Args: { "roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"is_assignment_active":
{ Args: { "ends_on": string,"starts_on": string }; Returns: boolean
                           },
"is_guardian_of":
{ Args: { "guardian"?: string,"target_patient": string }; Returns: boolean
                           },
"is_guardian_of_family":
{ Args: { "guardian"?: string,"target_family": string }; Returns: boolean
                           },
"is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_participant":
{ Args: { "target_conversation": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_therapist_of":
{ Args: { "target_patient": string,"therapist"?: string }; Returns: boolean
                           },
"is_therapist_of_family":
{ Args: { "target_family": string,"therapist"?: string }; Returns: boolean
                           },
"list_message_contacts":
{ Args: Record<PropertyKey, never>; Returns: {
              "full_name": string,"id": string,"role": Database["public"]['Enums']["app_role"],"specialty": string
            }[]
                           },
"list_my_conversations":
{ Args: Record<PropertyKey, never>; Returns: {
              "can_send": boolean,"conversation_id": string,"last_message_at": string,"last_message_body": string,"last_message_sender_id": string,"other_full_name": string,"other_profile_id": string,"other_role": Database["public"]['Enums']["app_role"],"unread_count": number
            }[]
                           },
"local_date":
{ Args: { "ts": string }; Returns: string
                           },
"log_file_access":
{ Args: { "path": string }; Returns: undefined
                           },
"log_record_access":
{ Args: { "target_patient": string }; Returns: undefined
                           },
"mark_invoice_paid":
{ Args: { "receipt_path"?: string,"target_request": string }; Returns: undefined
                           },
"notify":
{ Args: { "notification_body"?: string,"notification_kind": string,"notification_link"?: string,"notification_title": string,"target": string }; Returns: undefined
                           },
"notify_family":
{ Args: { "notification_body"?: string,"notification_kind": string,"notification_link"?: string,"notification_title": string,"target_family": string }; Returns: undefined
                           },
"notify_guardians":
{ Args: { "notification_body"?: string,"notification_kind": string,"notification_link"?: string,"notification_title": string,"target_patient": string }; Returns: undefined
                           },
"notify_roles":
{ Args: { "notification_body"?: string,"notification_kind": string,"notification_link"?: string,"notification_title": string,"roles": (Database["public"]['Enums']["app_role"])[] }; Returns: undefined
                           },
"owns_file_path":
{ Args: { "path": string }; Returns: boolean
                           },
"patient_name":
{ Args: { "target_patient": string }; Returns: string
                           },
"preview_invoice_items":
{ Args: { "target_period": string }; Returns: {
              "amount_cents": number,"appointment_id": string,"minutes": number,"pay_model": Database["public"]['Enums']["pay_model"],"rate_cents": number,"session_date": string,"therapist_id": string,"therapy_id": string
            }[]
                           },
"rate_for":
{ Args: { "on_date": string,"target_therapist": string,"target_therapy": string }; Returns: {
              "amount_cents": number,
"created_at": string,
"id": string,
"pay_model": Database["public"]['Enums']["pay_model"],
"therapist_id": string,
"therapy_id": string,
"valid_from": string
            }
                          SetofOptions: {
        from: "*"
        to: "therapist_rates"
        isOneToOne: true
        isSetofReturn: false
      } },
"request_reschedule":
{ Args: { "proposed_start": string,"request_reason": string,"target_appointment": string }; Returns: string
                           },
"respond_session_confirmation":
{ Args: { "confirmed": boolean,"note"?: string,"target_appointment": string }; Returns: undefined
                           },
"review_invoice":
{ Args: { "approve": boolean,"reason"?: string,"target_request": string }; Returns: undefined
                           },
"sign_document":
{ Args: { "client_ip": string,"client_user_agent": string,"target_request": string }; Returns: undefined
                           },
"start_conversation":
{ Args: { "other_profile": string }; Returns: string
                           },
"submit_invoice":
{ Args: { "file_path": string,"number": string,"target_request": string }; Returns: undefined
                           },
"therapy_name":
{ Args: { "target_therapy": string }; Returns: string
                           }
          }
          Enums: {
            "announcement_audience": "all"|"staff"|"guardians","app_role": "admin"|"coordination"|"reception"|"therapist"|"guardian","appointment_status": "scheduled"|"confirmed"|"completed"|"canceled"|"no_show","charge_status": "pending"|"paid"|"awaiting_insurance"|"canceled","document_category": "contract"|"anamnesis"|"report"|"medical"|"treatment_plan"|"administrative"|"other","document_status": "received"|"under_review"|"available","guardian_request_status": "open"|"answered"|"closed","guardian_request_type": "information"|"reschedule"|"billing"|"document"|"data_update"|"other","invoice_status": "requested"|"submitted"|"approved"|"rejected"|"paid","pay_model": "per_session"|"per_hour","payout_period_status": "open"|"closed","record_status": "active"|"pending"|"inactive","report_status": "pending"|"in_review"|"approved"|"returned","report_type": "evaluation"|"quarterly"|"semiannual"|"school"|"other","request_status": "pending"|"approved"|"rejected","signature_status": "pending"|"signed"|"canceled","task_priority": "normal"|"urgent","task_status": "open"|"done"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "announcement_audience": ["all", "staff", "guardians"],"app_role": ["admin", "coordination", "reception", "therapist", "guardian"],"appointment_status": ["scheduled", "confirmed", "completed", "canceled", "no_show"],"charge_status": ["pending", "paid", "awaiting_insurance", "canceled"],"document_category": ["contract", "anamnesis", "report", "medical", "treatment_plan", "administrative", "other"],"document_status": ["received", "under_review", "available"],"guardian_request_status": ["open", "answered", "closed"],"guardian_request_type": ["information", "reschedule", "billing", "document", "data_update", "other"],"invoice_status": ["requested", "submitted", "approved", "rejected", "paid"],"pay_model": ["per_session", "per_hour"],"payout_period_status": ["open", "closed"],"record_status": ["active", "pending", "inactive"],"report_status": ["pending", "in_review", "approved", "returned"],"report_type": ["evaluation", "quarterly", "semiannual", "school", "other"],"request_status": ["pending", "approved", "rejected"],"signature_status": ["pending", "signed", "canceled"],"task_priority": ["normal", "urgent"],"task_status": ["open", "done"]
          }
        }
} as const
