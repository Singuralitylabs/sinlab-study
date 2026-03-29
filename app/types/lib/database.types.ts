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
          prompt_tokens: number | null;
          review_content: string | null;
          reviewed_at: string | null;
          status: string;
          submission_id: number;
          updated_at: string;
        };
        Insert: {
          completion_tokens?: number | null;
          created_at?: string;
          error_message?: string | null;
          id?: number;
          model_used?: string | null;
          overall_score?: number | null;
          prompt_tokens?: number | null;
          review_content?: string | null;
          reviewed_at?: string | null;
          status?: string;
          submission_id: number;
          updated_at?: string;
        };
        Update: {
          completion_tokens?: number | null;
          created_at?: string;
          error_message?: string | null;
          id?: number;
          model_used?: string | null;
          overall_score?: number | null;
          prompt_tokens?: number | null;
          review_content?: string | null;
          reviewed_at?: string | null;
          status?: string;
          submission_id?: number;
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
      learning_contents: {
        Row: {
          allowed_submission_types: string;
          code_language: string;
          content_type: string;
          created_at: string | null;
          display_order: number | null;
          exercise_instructions: string | null;
          hint: string | null;
          id: number;
          is_deleted: boolean | null;
          is_published: boolean | null;
          pdf_url: string | null;
          reference_answer: string | null;
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
          display_order?: number | null;
          exercise_instructions?: string | null;
          hint?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          pdf_url?: string | null;
          reference_answer?: string | null;
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
          display_order?: number | null;
          exercise_instructions?: string | null;
          hint?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          is_published?: boolean | null;
          pdf_url?: string | null;
          reference_answer?: string | null;
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
      submissions: {
        Row: {
          code_content: string | null;
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
          id: number;
          is_completed: boolean | null;
          user_id: number;
        };
        Insert: {
          completed_at?: string | null;
          content_id: number;
          created_at?: string | null;
          id?: number;
          is_completed?: boolean | null;
          user_id: number;
        };
        Update: {
          completed_at?: string | null;
          content_id?: number;
          created_at?: string | null;
          id?: number;
          is_completed?: boolean | null;
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
          id: number;
          is_deleted: boolean | null;
          role: string;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          auth_id: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name: string;
          email: string;
          id?: number;
          is_deleted?: boolean | null;
          role?: string;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          auth_id?: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string;
          email?: string;
          id?: number;
          is_deleted?: boolean | null;
          role?: string;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_id: { Args: never; Returns: number };
      get_user_role: { Args: never; Returns: string };
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
