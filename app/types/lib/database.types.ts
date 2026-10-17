export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      ai_reviews: {
        Row: {
          completion_tokens: number | null;
          created_at: string;
          error_message: string | null;
          id: number;
          model_used: string | null;
          overall_score: number | null;
          passed: boolean | null;
          prompt_tokens: number | null;
          review_content: string | null;
          review_json: Json | null;
          reviewed_at: string | null;
          rubric_version: number | null;
          score_kind: string;
          status: string;
          submission_id: number;
          thoughts_tokens: number | null;
          updated_at: string;
        };
        Insert: {
          completion_tokens?: number | null;
          created_at?: string;
          error_message?: string | null;
          id?: number;
          model_used?: string | null;
          overall_score?: number | null;
          passed?: boolean | null;
          prompt_tokens?: number | null;
          review_content?: string | null;
          review_json?: Json | null;
          reviewed_at?: string | null;
          rubric_version?: number | null;
          score_kind?: string;
          status?: string;
          submission_id: number;
          thoughts_tokens?: number | null;
          updated_at?: string;
        };
        Update: {
          completion_tokens?: number | null;
          created_at?: string;
          error_message?: string | null;
          id?: number;
          model_used?: string | null;
          overall_score?: number | null;
          passed?: boolean | null;
          prompt_tokens?: number | null;
          review_content?: string | null;
          review_json?: Json | null;
          reviewed_at?: string | null;
          rubric_version?: number | null;
          score_kind?: string;
          status?: string;
          submission_id?: number;
          thoughts_tokens?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_reviews_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_reads: {
        Row: {
          announcement_id: number;
          read_at: string;
          user_id: number;
        };
        Insert: {
          announcement_id: number;
          read_at?: string;
          user_id: number;
        };
        Update: {
          announcement_id?: number;
          read_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          body: string;
          created_at: string;
          created_by: number | null;
          email_sent_at: string | null;
          id: number;
          is_deleted: boolean;
          published_at: string | null;
          push_sent_at: string | null;
          send_email: boolean;
          target_membership_types: string[] | null;
          target_statuses: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: number | null;
          email_sent_at?: string | null;
          id?: number;
          is_deleted?: boolean;
          published_at?: string | null;
          push_sent_at?: string | null;
          send_email?: boolean;
          target_membership_types?: string[] | null;
          target_statuses: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: number | null;
          email_sent_at?: string | null;
          id?: number;
          is_deleted?: boolean;
          published_at?: string | null;
          push_sent_at?: string | null;
          send_email?: boolean;
          target_membership_types?: string[] | null;
          target_statuses?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      certificates: {
        Row: {
          certificate_no: string;
          created_at: string;
          id: number;
          issued_at: string;
          recipient_name: string;
          theme_id: number;
          theme_name: string;
          user_id: number;
        };
        Insert: {
          certificate_no: string;
          created_at?: string;
          id?: number;
          issued_at?: string;
          recipient_name: string;
          theme_id: number;
          theme_name: string;
          user_id: number;
        };
        Update: {
          certificate_no?: string;
          created_at?: string;
          id?: number;
          issued_at?: string;
          recipient_name?: string;
          theme_id?: number;
          theme_name?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_theme_id_fkey";
            columns: ["theme_id"];
            isOneToOne: false;
            referencedRelation: "learning_themes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cron_locks: {
        Row: {
          locked_at: string;
          name: string;
        };
        Insert: {
          locked_at: string;
          name: string;
        };
        Update: {
          locked_at?: string;
          name?: string;
        };
        Relationships: [];
      };
      email_kind_settings: {
        Row: {
          enabled: boolean;
          kind: string;
          push_enabled: boolean;
          send_days: number[] | null;
          send_weekday: number | null;
          updated_at: string;
          updated_by: number | null;
        };
        Insert: {
          enabled?: boolean;
          kind: string;
          push_enabled?: boolean;
          send_days?: number[] | null;
          send_weekday?: number | null;
          updated_at?: string;
          updated_by?: number | null;
        };
        Update: {
          enabled?: boolean;
          kind?: string;
          push_enabled?: boolean;
          send_days?: number[] | null;
          send_weekday?: number | null;
          updated_at?: string;
          updated_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_kind_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          created_at: string;
          error: string | null;
          id: number;
          kind: string;
          provider_message_id: string | null;
          reference_key: string;
          sent_at: string | null;
          user_id: number;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: number;
          kind: string;
          provider_message_id?: string | null;
          reference_key: string;
          sent_at?: string | null;
          user_id: number;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: number;
          kind?: string;
          provider_message_id?: string | null;
          reference_key?: string;
          sent_at?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_settings: {
        Row: {
          digest_daily_limit: number;
          id: number;
          sending_enabled: boolean;
          sending_updated_at: string | null;
          sending_updated_by: number | null;
          service_name: string;
          service_subtitle: string | null;
          service_updated_at: string | null;
          service_updated_by: number | null;
          updated_at: string;
          updated_by: number | null;
        };
        Insert: {
          digest_daily_limit: number;
          id?: number;
          sending_enabled?: boolean;
          sending_updated_at?: string | null;
          sending_updated_by?: number | null;
          service_name?: string;
          service_subtitle?: string | null;
          service_updated_at?: string | null;
          service_updated_by?: number | null;
          updated_at?: string;
          updated_by?: number | null;
        };
        Update: {
          digest_daily_limit?: number;
          id?: number;
          sending_enabled?: boolean;
          sending_updated_at?: string | null;
          sending_updated_by?: number | null;
          service_name?: string;
          service_subtitle?: string | null;
          service_updated_at?: string | null;
          service_updated_by?: number | null;
          updated_at?: string;
          updated_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_settings_sending_updated_by_fkey";
            columns: ["sending_updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_settings_service_updated_by_fkey";
            columns: ["service_updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_templates: {
        Row: {
          body: string;
          subject: string;
          template_key: string;
          updated_at: string;
          updated_by: number | null;
        };
        Insert: {
          body: string;
          subject: string;
          template_key: string;
          updated_at?: string;
          updated_by?: number | null;
        };
        Update: {
          body?: string;
          subject?: string;
          template_key?: string;
          updated_at?: string;
          updated_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_test_sends: {
        Row: {
          created_at: string;
          id: number;
          user_id: number | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          user_id?: number | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_test_sends_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      feedbacks: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          id: number;
          page_url: string | null;
          status: string;
          user_agent: string | null;
          user_id: number;
        };
        Insert: {
          body: string;
          category: string;
          created_at?: string;
          id?: number;
          page_url?: string | null;
          status?: string;
          user_agent?: string | null;
          user_id: number;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          id?: number;
          page_url?: string | null;
          status?: string;
          user_agent?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "feedbacks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_contents: {
        Row: {
          allowed_submission_types: string;
          code_language: string;
          content_type: string;
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          exercise_instructions: string | null;
          grading_rubric: Json | null;
          has_grading_requirements: boolean | null;
          hint: string | null;
          id: number;
          is_deleted: boolean | null;
          is_open_to_trial: boolean;
          is_published: boolean | null;
          pdf_url: string | null;
          reference_answer: string | null;
          show_console: boolean | null;
          show_preview: boolean | null;
          starter_files: Json | null;
          submission_file_slots: Json | null;
          text_content: string | null;
          title: string;
          updated_at: string | null;
          video_url: string | null;
          week_id: number;
        };
        Insert: {
          allowed_submission_types?: string;
          code_language?: string;
          content_type: string;
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          exercise_instructions?: string | null;
          grading_rubric?: Json | null;
          has_grading_requirements?: boolean | null;
          hint?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          is_open_to_trial?: boolean;
          is_published?: boolean | null;
          pdf_url?: string | null;
          reference_answer?: string | null;
          show_console?: boolean | null;
          show_preview?: boolean | null;
          starter_files?: Json | null;
          submission_file_slots?: Json | null;
          text_content?: string | null;
          title: string;
          updated_at?: string | null;
          video_url?: string | null;
          week_id: number;
        };
        Update: {
          allowed_submission_types?: string;
          code_language?: string;
          content_type?: string;
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          exercise_instructions?: string | null;
          grading_rubric?: Json | null;
          has_grading_requirements?: boolean | null;
          hint?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          is_open_to_trial?: boolean;
          is_published?: boolean | null;
          pdf_url?: string | null;
          reference_answer?: string | null;
          show_console?: boolean | null;
          show_preview?: boolean | null;
          starter_files?: Json | null;
          submission_file_slots?: Json | null;
          text_content?: string | null;
          title?: string;
          updated_at?: string | null;
          video_url?: string | null;
          week_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "learning_contents_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "learning_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_phases: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: number;
          is_deleted: boolean | null;
          is_published: boolean | null;
          name: string;
          theme_id: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name: string;
          theme_id: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name?: string;
          theme_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_phases_theme_id_fkey";
            columns: ["theme_id"];
            isOneToOne: false;
            referencedRelation: "learning_themes";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_themes: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: number;
          image_url: string | null;
          is_deleted: boolean | null;
          is_published: boolean | null;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          image_url?: string | null;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          image_url?: string | null;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      learning_weeks: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: number;
          is_deleted: boolean | null;
          is_published: boolean | null;
          name: string;
          phase_id: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name: string;
          phase_id: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          name?: string;
          phase_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_weeks_phase_id_fkey";
            columns: ["phase_id"];
            isOneToOne: false;
            referencedRelation: "learning_phases";
            referencedColumns: ["id"];
          },
        ];
      };
      push_logs: {
        Row: {
          created_at: string;
          error: string | null;
          id: number;
          kind: string;
          reference_key: string;
          sent_at: string | null;
          user_id: number;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: number;
          kind: string;
          reference_key: string;
          sent_at?: string | null;
          user_id: number;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: number;
          kind?: string;
          reference_key?: string;
          sent_at?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "push_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          disabled_at: string | null;
          endpoint: string;
          id: number;
          last_used_at: string;
          p256dh: string;
          user_agent: string | null;
          user_id: number;
        };
        Insert: {
          auth: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint: string;
          id?: number;
          last_used_at?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: number;
        };
        Update: {
          auth?: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint?: string;
          id?: number;
          last_used_at?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        Row: {
          choices: string[];
          content_id: number;
          correct_choices: number[];
          created_at: string;
          display_order: number;
          explanation: string | null;
          hint: string | null;
          id: number;
          model_answer: string | null;
          question: string;
          question_type: string;
          updated_at: string;
        };
        Insert: {
          choices?: string[];
          content_id: number;
          correct_choices?: number[];
          created_at?: string;
          display_order: number;
          explanation?: string | null;
          hint?: string | null;
          id?: number;
          model_answer?: string | null;
          question: string;
          question_type: string;
          updated_at?: string;
        };
        Update: {
          choices?: string[];
          content_id?: number;
          correct_choices?: number[];
          created_at?: string;
          display_order?: number;
          explanation?: string | null;
          hint?: string | null;
          id?: number;
          model_answer?: string | null;
          question?: string;
          question_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_questions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "learning_contents";
            referencedColumns: ["id"];
          },
        ];
      };
      review_notes: {
        Row: {
          content_id: number;
          created_at: string;
          id: number;
          memo: string | null;
          requirement_key: string | null;
          understood_at: string | null;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          content_id: number;
          created_at?: string;
          id?: number;
          memo?: string | null;
          requirement_key?: string | null;
          understood_at?: string | null;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          content_id?: number;
          created_at?: string;
          id?: number;
          memo?: string | null;
          requirement_key?: string | null;
          understood_at?: string | null;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "review_notes_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "learning_contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          processed_at: string;
          type: string;
        };
        Insert: {
          id: string;
          processed_at?: string;
          type: string;
        };
        Update: {
          id?: string;
          processed_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      stripe_subscriptions: {
        Row: {
          became_active_at: string | null;
          became_terminal_at: string | null;
          cancel_at: string | null;
          cancel_at_period_end: boolean;
          checkout_claimed_at: string | null;
          checkout_session_id: string | null;
          created_at: string;
          current_period_end: string | null;
          id: number;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          became_active_at?: string | null;
          became_terminal_at?: string | null;
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          checkout_claimed_at?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: number;
          status: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          became_active_at?: string | null;
          became_terminal_at?: string | null;
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          checkout_claimed_at?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: number;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          code_content: string | null;
          code_files: Json | null;
          content_id: number;
          created_at: string | null;
          id: number;
          submission_type: string;
          submitted_at: string | null;
          url: string | null;
          user_id: number;
        };
        Insert: {
          code_content?: string | null;
          code_files?: Json | null;
          content_id: number;
          created_at?: string | null;
          id?: number;
          submission_type: string;
          submitted_at?: string | null;
          url?: string | null;
          user_id: number;
        };
        Update: {
          code_content?: string | null;
          code_files?: Json | null;
          content_id?: number;
          created_at?: string | null;
          id?: number;
          submission_type?: string;
          submitted_at?: string | null;
          url?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "learning_contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_progress: {
        Row: {
          completed_at: string | null;
          content_id: number;
          created_at: string | null;
          ever_completed: boolean;
          id: number;
          is_completed: boolean | null;
          last_viewed_at: string | null;
          retry_started_at: string | null;
          user_id: number;
        };
        Insert: {
          completed_at?: string | null;
          content_id: number;
          created_at?: string | null;
          ever_completed?: boolean;
          id?: number;
          is_completed?: boolean | null;
          last_viewed_at?: string | null;
          retry_started_at?: string | null;
          user_id: number;
        };
        Update: {
          completed_at?: string | null;
          content_id?: number;
          created_at?: string | null;
          ever_completed?: boolean;
          id?: number;
          is_completed?: boolean | null;
          last_viewed_at?: string | null;
          retry_started_at?: string | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_progress_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "learning_contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          auth_id: string;
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          display_name: string;
          email: string;
          email_opt_out_at: string | null;
          id: number;
          is_deleted: boolean | null;
          membership_type: string | null;
          notification_email: string | null;
          notification_email_expires_at: string | null;
          notification_email_pending: string | null;
          notification_email_token_hash: string | null;
          onboarding_completed_at: string | null;
          role: string;
          status: string;
          terms_accepted_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          auth_id: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name: string;
          email: string;
          email_opt_out_at?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          membership_type?: string | null;
          notification_email?: string | null;
          notification_email_expires_at?: string | null;
          notification_email_pending?: string | null;
          notification_email_token_hash?: string | null;
          onboarding_completed_at?: string | null;
          role?: string;
          status?: string;
          terms_accepted_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          auth_id?: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string;
          email?: string;
          email_opt_out_at?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          membership_type?: string | null;
          notification_email?: string | null;
          notification_email_expires_at?: string | null;
          notification_email_pending?: string | null;
          notification_email_token_hash?: string | null;
          onboarding_completed_at?: string | null;
          role?: string;
          status?: string;
          terms_accepted_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      bulk_update_sibling_display_order: {
        Args: { p_table: string; p_updates: Json };
        Returns: undefined;
      };
      claim_ai_review: {
        Args: {
          p_active_per_content_per_day: number;
          p_active_per_day: number;
          p_content_id: number;
          p_day_start: string;
          p_stale_before: string;
          p_submission_id: number;
          p_trial_per_content_lifetime: number;
          p_user_id: number;
          p_user_status: string;
        };
        Returns: Json;
      };
      claim_email_test_send: {
        Args: { p_day_start: string; p_limit: number; p_user_id: number };
        Returns: number;
      };
      claim_notification_email_confirm: {
        Args: {
          p_limit: number;
          p_reference_key: string;
          p_since: string;
          p_user_id: number;
        };
        Returns: number;
      };
      content_requires_review_pass: {
        Args: { p_content_id: number };
        Returns: boolean;
      };
      content_review_pass_unachievable: {
        Args: { p_content_id: number };
        Returns: boolean;
      };
      content_visible_to_caller: {
        Args: { p_content_id: number; p_content_type: string };
        Returns: boolean;
      };
      get_exercise_reference_answer: {
        Args: { p_content_id: number };
        Returns: {
          reference_answer: string;
        }[];
      };
      get_quiz_questions: {
        Args: { p_content_id: number };
        Returns: {
          choices: string[];
          display_order: number;
          hint: string;
          id: number;
          question: string;
          question_type: string;
          revision: string;
        }[];
      };
      get_students_progress_summary: {
        Args: never;
        Returns: {
          completed_count: number;
          last_activity: string;
          user_id: number;
        }[];
      };
      get_user_id: { Args: never; Returns: number };
      get_user_membership_type: { Args: never; Returns: string };
      get_user_role: { Args: never; Returns: string };
      get_user_status: { Args: never; Returns: string };
      get_weekly_funnel: {
        Args: { weeks?: number };
        Returns: {
          activated: number;
          ended: number;
          paid_total: number;
          signups: number;
          upgraded: number;
          week_start: string;
        }[];
      };
      grade_quiz_answers: {
        Args: { p_answers: Json; p_content_id: number };
        Returns: {
          correct_choices: number[];
          explanation: string;
          is_correct: boolean;
          model_answer: string;
          question_id: number;
          question_type: string;
        }[];
      };
      learning_content_requires_review_pass: {
        Args: { p_content_id: number };
        Returns: boolean;
      };
      learning_content_review_pass_unachievable: {
        Args: { p_content_id: number };
        Returns: boolean;
      };
      quiz_content_visible_to_caller: {
        Args: { p_content_id: number };
        Returns: boolean;
      };
      quiz_correct_choices_valid: {
        Args: { p_choices: string[]; p_correct: number[] };
        Returns: boolean;
      };
      quiz_question_revision: {
        Args: {
          p_choices: string[];
          p_question: string;
          p_question_type: string;
        };
        Returns: string;
      };
      replace_quiz_questions: {
        Args: { p_content_id: number; p_questions: Json };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
