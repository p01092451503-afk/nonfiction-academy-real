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
      announcement_i18n: {
        Row: {
          announcement_id: string
          content: string
          created_at: string
          id: string
          language_code: string
          title: string
          updated_at: string
        }
        Insert: {
          announcement_id: string
          content: string
          created_at?: string
          id?: string
          language_code: string
          title: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          content?: string
          created_at?: string
          id?: string
          language_code?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_i18n_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          is_published: boolean
          target_branch_ids: string[] | null
          target_countries: string[] | null
          target_course_ids: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          target_branch_ids?: string[] | null
          target_countries?: string[] | null
          target_course_ids?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          target_branch_ids?: string[] | null
          target_countries?: string[] | null
          target_course_ids?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      assessment_answers: {
        Row: {
          attempt_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_correct: boolean | null
          points_earned: number | null
          question_id: string
          user_answer: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_id: string
          user_answer?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          question_id?: string
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          completed_at: string | null
          created_at: string
          id: string
          passed: boolean | null
          score: number | null
          started_at: string
          total_points: number | null
          user_id: string
        }
        Insert: {
          assessment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string
          total_points?: number | null
          user_id: string
        }
        Update: {
          assessment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string
          total_points?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_i18n: {
        Row: {
          assessment_id: string
          created_at: string
          description: string | null
          id: string
          language_code: string
          title: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          description?: string | null
          id?: string
          language_code: string
          title: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_i18n_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_question_i18n: {
        Row: {
          correct_answer: string | null
          created_at: string
          explanation: string | null
          hint: string | null
          id: string
          language_code: string
          options: Json | null
          question_id: string
          question_text: string
          updated_at: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          hint?: string | null
          id?: string
          language_code: string
          options?: Json | null
          question_id: string
          question_text: string
          updated_at?: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          hint?: string | null
          id?: string
          language_code?: string
          options?: Json | null
          question_id?: string
          question_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_question_i18n_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          correct_answer: string
          created_at: string
          explanation: string | null
          hint: string | null
          id: string
          options: Json | null
          order_index: number
          points: number
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          assessment_id: string
          correct_answer: string
          created_at?: string
          explanation?: string | null
          hint?: string | null
          id?: string
          options?: Json | null
          order_index?: number
          points?: number
          question_text: string
          question_type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          correct_answer?: string
          created_at?: string
          explanation?: string | null
          hint?: string | null
          id?: string
          options?: Json | null
          order_index?: number
          points?: number
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          completion_threshold: number
          course_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          max_attempts: number
          order_index: number
          passing_score: number
          randomize_questions: boolean
          require_assessment_for_completion: boolean
          time_limit_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          completion_threshold?: number
          course_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          max_attempts?: number
          order_index?: number
          passing_score?: number
          randomize_questions?: boolean
          require_assessment_for_completion?: boolean
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          completion_threshold?: number
          course_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          max_attempts?: number
          order_index?: number
          passing_score?: number
          randomize_questions?: boolean
          require_assessment_for_completion?: boolean
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          feedback: string | null
          file_urls: string[] | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"] | null
          student_id: string
          submission_text: string | null
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          feedback?: string | null
          file_urls?: string[] | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"] | null
          student_id: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          feedback?: string | null
          file_urls?: string[] | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"] | null
          student_id?: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          allow_late_submission: boolean | null
          course_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          instructions: string | null
          instructions_en: string | null
          max_score: number | null
          status: Database["public"]["Enums"]["assignment_status"] | null
          title: string
          title_en: string | null
          updated_at: string | null
        }
        Insert: {
          allow_late_submission?: boolean | null
          course_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          instructions_en?: string | null
          max_score?: number | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          title: string
          title_en?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_late_submission?: boolean | null
          course_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          instructions_en?: string | null
          max_score?: number | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          title?: string
          title_en?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string | null
          check_in_time: string | null
          course_id: string
          created_at: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendance_date?: string | null
          check_in_time?: string | null
          course_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendance_date?: string | null
          check_in_time?: string | null
          course_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          badge_type: string
          created_at: string | null
          description: string | null
          icon: string
          id: string
          name: string
          requirement_type: string
          requirement_value: number
        }
        Insert: {
          badge_type: string
          created_at?: string | null
          description?: string | null
          icon: string
          id?: string
          name: string
          requirement_type: string
          requirement_value: number
        }
        Update: {
          badge_type?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          name?: string
          requirement_type?: string
          requirement_value?: number
        }
        Relationships: []
      }
      board_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_i18n: {
        Row: {
          content: string
          created_at: string
          id: string
          language_code: string
          post_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          language_code: string
          post_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language_code?: string
          post_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_post_i18n_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_id: string
          content: string
          course_id: string | null
          created_at: string
          file_urls: string[] | null
          id: string
          is_pinned: boolean
          is_published: boolean
          target_branch_ids: string[] | null
          target_countries: string[] | null
          target_course_ids: string[] | null
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id: string
          content: string
          course_id?: string | null
          created_at?: string
          file_urls?: string[] | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          target_branch_ids?: string[] | null
          target_countries?: string[] | null
          target_course_ids?: string[] | null
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string
          content?: string
          course_id?: string | null
          created_at?: string
          file_urls?: string[] | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          target_branch_ids?: string[] | null
          target_countries?: string[] | null
          target_course_ids?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          name_en: string | null
          name_ja: string | null
          name_yue: string | null
          name_zh_cn: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          name_en?: string | null
          name_ja?: string | null
          name_yue?: string | null
          name_zh_cn?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          name_ja?: string | null
          name_yue?: string | null
          name_zh_cn?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      certificate_templates: {
        Row: {
          background_image_url: string | null
          course_id: string | null
          created_at: string
          description_text: string | null
          id: string
          issuer_name: string | null
          title_text: string
          updated_at: string
        }
        Insert: {
          background_image_url?: string | null
          course_id?: string | null
          created_at?: string
          description_text?: string | null
          id?: string
          issuer_name?: string | null
          title_text?: string
          updated_at?: string
        }
        Update: {
          background_image_url?: string | null
          course_id?: string | null
          created_at?: string
          description_text?: string | null
          id?: string
          issuer_name?: string | null
          title_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string
          created_at: string
          id: string
          issued_at: string
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_translations: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          source_lang: string | null
          target_lang: string
          translated_text: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          source_lang?: string | null
          target_lang: string
          translated_text: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          source_lang?: string | null
          target_lang?: string
          translated_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_translations_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "course_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      completion_criteria: {
        Row: {
          certificate_enabled: boolean
          course_id: string
          created_at: string
          id: string
          min_assessment_score: number | null
          min_progress_pct: number
          updated_at: string
        }
        Insert: {
          certificate_enabled?: boolean
          course_id: string
          created_at?: string
          id?: string
          min_assessment_score?: number | null
          min_progress_pct?: number
          updated_at?: string
        }
        Update: {
          certificate_enabled?: boolean
          course_id?: string
          created_at?: string
          id?: string
          min_assessment_score?: number | null
          min_progress_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "completion_criteria_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          content_id: string
          id: string
          last_accessed_at: string | null
          last_position_seconds: number | null
          progress_percentage: number | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          content_id: string
          id?: string
          last_accessed_at?: string | null
          last_position_seconds?: number | null
          progress_percentage?: number | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          content_id?: string
          id?: string
          last_accessed_at?: string | null
          last_position_seconds?: number | null
          progress_percentage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_progress_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "course_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      course_comments: {
        Row: {
          content: string
          course_id: string
          created_at: string
          id: string
          is_deleted: boolean
          language_code: string | null
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          course_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          language_code?: string | null
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          course_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          language_code?: string | null
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_comments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "course_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      course_content_i18n: {
        Row: {
          content_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          language_code: string
          title: string
          updated_at: string | null
          video_provider: string | null
          video_url: string | null
        }
        Insert: {
          content_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          language_code: string
          title: string
          updated_at?: string | null
          video_provider?: string | null
          video_url?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          language_code?: string
          title?: string
          updated_at?: string | null
          video_provider?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_content_i18n_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "course_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      course_contents: {
        Row: {
          content_type: Database["public"]["Enums"]["content_type"] | null
          course_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_preview: boolean | null
          is_published: boolean | null
          language_code: string
          order_index: number | null
          title: string
          updated_at: string | null
          video_provider: Database["public"]["Enums"]["video_provider"] | null
          video_url: string | null
        }
        Insert: {
          content_type?: Database["public"]["Enums"]["content_type"] | null
          course_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_preview?: boolean | null
          is_published?: boolean | null
          language_code?: string
          order_index?: number | null
          title: string
          updated_at?: string | null
          video_provider?: Database["public"]["Enums"]["video_provider"] | null
          video_url?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["content_type"] | null
          course_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_preview?: boolean | null
          is_published?: boolean | null
          language_code?: string
          order_index?: number | null
          title?: string
          updated_at?: string | null
          video_provider?: Database["public"]["Enums"]["video_provider"] | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_contents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_drafts: {
        Row: {
          created_at: string
          draft_data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_data?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      course_i18n: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          language_code: string
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          language_code: string
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          language_code?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_i18n_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_learning_sessions: {
        Row: {
          course_id: string
          created_at: string
          estimation_method: string | null
          id: string
          is_estimated: boolean
          last_heartbeat_at: string
          started_at: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          estimation_method?: string | null
          id?: string
          is_estimated?: boolean
          last_heartbeat_at?: string
          started_at?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          estimation_method?: string | null
          id?: string
          is_estimated?: boolean
          last_heartbeat_at?: string
          started_at?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      course_target_departments: {
        Row: {
          course_id: string
          department_id: string
        }
        Insert: {
          course_id: string
          department_id: string
        }
        Update: {
          course_id?: string
          department_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_target_departments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_target_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category_id: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          difficulty_level: string | null
          estimated_duration_hours: number | null
          id: string
          instructor_id: string | null
          is_mandatory: boolean | null
          is_sequential: boolean
          max_students: number | null
          min_learning_minutes: number
          status: string | null
          target_departments: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_hours?: number | null
          id?: string
          instructor_id?: string | null
          is_mandatory?: boolean | null
          is_sequential?: boolean
          max_students?: number | null
          min_learning_minutes?: number
          status?: string | null
          target_departments?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_hours?: number | null
          id?: string
          instructor_id?: string | null
          is_mandatory?: boolean | null
          is_sequential?: boolean
          max_students?: number | null
          min_learning_minutes?: number
          status?: string | null
          target_departments?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          country: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          name_en: string | null
          parent_department_id: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          name_en?: string | null
          parent_department_id?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          parent_department_id?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          completed_at: string | null
          completion_count: number
          course_id: string
          enrolled_at: string | null
          id: string
          progress: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completion_count?: number
          course_id: string
          enrolled_at?: string | null
          id?: string
          progress?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completion_count?: number
          course_id?: string
          enrolled_at?: string | null
          id?: string
          progress?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      error_alert_log: {
        Row: {
          admin_notes: string | null
          ai_explanation: string | null
          ai_generated_at: string | null
          ai_lovable_prompt: string | null
          created_at: string
          fingerprint: string
          id: string
          last_alerted_at: string
          message: string | null
          occurrence_count: number
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          source: string | null
          stack: string | null
          status: string
          url: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_explanation?: string | null
          ai_generated_at?: string | null
          ai_lovable_prompt?: string | null
          created_at?: string
          fingerprint: string
          id?: string
          last_alerted_at?: string
          message?: string | null
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          source?: string | null
          stack?: string | null
          status?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_explanation?: string | null
          ai_generated_at?: string | null
          ai_lovable_prompt?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          last_alerted_at?: string
          message?: string | null
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          source?: string | null
          stack?: string | null
          status?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      learning_tracks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          description_en: string | null
          id: string
          is_sequential: boolean
          status: string
          target_branch_ids: string[] | null
          target_team_ids: string[] | null
          thumbnail_url: string | null
          title: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_en?: string | null
          id?: string
          is_sequential?: boolean
          status?: string
          target_branch_ids?: string[] | null
          target_team_ids?: string[] | null
          thumbnail_url?: string | null
          title: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_en?: string | null
          id?: string
          is_sequential?: boolean
          status?: string
          target_branch_ids?: string[] | null
          target_team_ids?: string[] | null
          thumbnail_url?: string | null
          title?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      learning_tracks_i18n: {
        Row: {
          created_at: string
          description: string | null
          id: string
          language_code: string
          source_description: string | null
          source_title: string | null
          title: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          language_code: string
          source_description?: string | null
          source_title?: string | null
          title: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          source_description?: string | null
          source_title?: string | null
          title?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_tracks_i18n_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "learning_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_learning_records: {
        Row: {
          completed_at: string | null
          course_title: string
          course_title_en: string | null
          created_at: string
          id: string
          is_completed: boolean
          notes: string | null
          source_course_id: string | null
          source_lms: string | null
          updated_at: string
          upload_batch_id: string | null
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_title: string
          course_title_en?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          source_course_id?: string | null
          source_lms?: string | null
          updated_at?: string
          upload_batch_id?: string | null
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_title?: string
          course_title_en?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          source_course_id?: string | null
          source_lms?: string | null
          updated_at?: string
          upload_batch_id?: string | null
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      media_package_items: {
        Row: {
          caption: string | null
          content_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          item_type: string
          media_url: string
          order_index: number
          overlay_autoplay: boolean
          overlay_delay_sec: number
          overlay_end_sec: number | null
          overlay_h: number | null
          overlay_loop: boolean
          overlay_muted: boolean
          overlay_opacity: number
          overlay_playback_rate: number
          overlay_show_controls: boolean
          overlay_start_sec: number | null
          overlay_thumbnail_url: string | null
          overlay_video_provider: string | null
          overlay_video_url: string | null
          overlay_volume: number
          overlay_w: number | null
          overlay_x: number | null
          overlay_y: number | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          content_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          item_type: string
          media_url: string
          order_index?: number
          overlay_autoplay?: boolean
          overlay_delay_sec?: number
          overlay_end_sec?: number | null
          overlay_h?: number | null
          overlay_loop?: boolean
          overlay_muted?: boolean
          overlay_opacity?: number
          overlay_playback_rate?: number
          overlay_show_controls?: boolean
          overlay_start_sec?: number | null
          overlay_thumbnail_url?: string | null
          overlay_video_provider?: string | null
          overlay_video_url?: string | null
          overlay_volume?: number
          overlay_w?: number | null
          overlay_x?: number | null
          overlay_y?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          content_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          item_type?: string
          media_url?: string
          order_index?: number
          overlay_autoplay?: boolean
          overlay_delay_sec?: number
          overlay_end_sec?: number | null
          overlay_h?: number | null
          overlay_loop?: boolean
          overlay_muted?: boolean
          overlay_opacity?: number
          overlay_playback_rate?: number
          overlay_show_controls?: boolean
          overlay_start_sec?: number | null
          overlay_thumbnail_url?: string | null
          overlay_video_provider?: string | null
          overlay_video_url?: string | null
          overlay_volume?: number
          overlay_w?: number | null
          overlay_x?: number | null
          overlay_y?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_package_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "course_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_completions: {
        Row: {
          course_id: number
          created_at: string
          employee_id: number
          id: number
          status: string
        }
        Insert: {
          course_id: number
          created_at?: string
          employee_id: number
          id?: number
          status: string
        }
        Update: {
          course_id?: number
          created_at?: string
          employee_id?: number
          id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_completions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "migration_courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "migration_completions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "migration_employees"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      migration_courses: {
        Row: {
          country: string
          course_id: number
          course_name: string
          created_at: string
          year: number
        }
        Insert: {
          country: string
          course_id: number
          course_name: string
          created_at?: string
          year: number
        }
        Update: {
          country?: string
          course_id?: number
          course_name?: string
          created_at?: string
          year?: number
        }
        Relationships: []
      }
      migration_employees: {
        Row: {
          country: string
          created_at: string
          email: string | null
          employee_id: number
          name: string
          position: string | null
          start_date: string | null
          store: string | null
        }
        Insert: {
          country: string
          created_at?: string
          email?: string | null
          employee_id: number
          name: string
          position?: string | null
          start_date?: string | null
          store?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          email?: string | null
          employee_id?: number
          name?: string
          position?: string | null
          start_date?: string | null
          store?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          message_i18n: Json | null
          title: string
          title_i18n: Json | null
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          message_i18n?: Json | null
          title: string
          title_i18n?: Json | null
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          message_i18n?: Json | null
          title?: string
          title_i18n?: Json | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_updates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          message: string
          pwa_only: boolean
          require_reload: boolean
          severity: string
          target_audience: string
          title: string
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message: string
          pwa_only?: boolean
          require_reload?: boolean
          severity?: string
          target_audience?: string
          title: string
          version: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          pwa_only?: boolean
          require_reload?: boolean
          severity?: string
          target_audience?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      point_history: {
        Row: {
          action_type: string
          created_at: string | null
          description: string | null
          id: string
          points: number
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          points: number
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          points?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: string | null
          department_id: string | null
          email: string | null
          employee_id: string | null
          full_name: string | null
          phone_number: string | null
          position: string | null
          team_name: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          phone_number?: string | null
          position?: string | null
          team_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          phone_number?: string | null
          position?: string | null
          team_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pwa_settings: {
        Row: {
          app_name: string
          background_color: string
          created_at: string
          description: string
          id: string
          install_prompt_enabled: boolean
          install_prompt_interval_days: number
          short_name: string
          singleton: boolean
          theme_color: string
          updated_at: string
        }
        Insert: {
          app_name?: string
          background_color?: string
          created_at?: string
          description?: string
          id?: string
          install_prompt_enabled?: boolean
          install_prompt_interval_days?: number
          short_name?: string
          singleton?: boolean
          theme_color?: string
          updated_at?: string
        }
        Update: {
          app_name?: string
          background_color?: string
          created_at?: string
          description?: string
          id?: string
          install_prompt_enabled?: boolean
          install_prompt_interval_days?: number
          short_name?: string
          singleton?: boolean
          theme_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_fix_audit: {
        Row: {
          affected_count: number
          applied_at: string
          applied_by: string | null
          check_id: string
          error_message: string | null
          fix_action: string
          id: string
          request_payload: Json | null
          result_payload: Json | null
          success: boolean
        }
        Insert: {
          affected_count?: number
          applied_at?: string
          applied_by?: string | null
          check_id: string
          error_message?: string | null
          fix_action: string
          id?: string
          request_payload?: Json | null
          result_payload?: Json | null
          success?: boolean
        }
        Update: {
          affected_count?: number
          applied_at?: string
          applied_by?: string | null
          check_id?: string
          error_message?: string | null
          fix_action?: string
          id?: string
          request_payload?: Json | null
          result_payload?: Json | null
          success?: boolean
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          created_at: string
          duration_ms: number
          error_count: number
          id: string
          ok_count: number
          results: Json
          scanned_at: string
          scanned_by: string | null
          total_findings: number
          warning_count: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          error_count?: number
          id?: string
          ok_count?: number
          results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total_findings?: number
          warning_count?: number
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_count?: number
          id?: string
          ok_count?: number
          results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total_findings?: number
          warning_count?: number
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      survey_answers: {
        Row: {
          answer_text: string | null
          answer_value: number | null
          created_at: string
          id: string
          question_id: string
          response_id: string
        }
        Insert: {
          answer_text?: string | null
          answer_value?: number | null
          created_at?: string
          id?: string
          question_id: string
          response_id: string
        }
        Update: {
          answer_text?: string | null
          answer_value?: number | null
          created_at?: string
          id?: string
          question_id?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          options: Json | null
          options_en: Json | null
          order_index: number
          question_text: string
          question_text_en: string | null
          question_type: Database["public"]["Enums"]["survey_question_type"]
          survey_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          options_en?: Json | null
          order_index?: number
          question_text: string
          question_text_en?: string | null
          question_type?: Database["public"]["Enums"]["survey_question_type"]
          survey_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          options_en?: Json | null
          order_index?: number
          question_text?: string
          question_text_en?: string | null
          question_type?: Database["public"]["Enums"]["survey_question_type"]
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          survey_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          survey_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          description: string | null
          description_en: string | null
          id: string
          is_active: boolean
          title: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          title: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          title?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tenants: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          domain: string | null
          id: string
          is_active: boolean | null
          monthly_storage_limit_gb: number | null
          monthly_traffic_limit_gb: number | null
          name: string
          notes: string | null
          plan: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean | null
          monthly_storage_limit_gb?: number | null
          monthly_traffic_limit_gb?: number | null
          name: string
          notes?: string | null
          plan?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean | null
          monthly_storage_limit_gb?: number | null
          monthly_traffic_limit_gb?: number | null
          name?: string
          notes?: string | null
          plan?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      track_enrollments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          id: string
          status: string
          track_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          id?: string
          status?: string
          track_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          id?: string
          status?: string
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_enrollments_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "learning_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_stage_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          order_index: number
          stage_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          stage_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_stage_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_stage_courses_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "track_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      track_stages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          name_en: string | null
          order_index: number
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          name_en?: string | null
          order_index?: number
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          name_en?: string | null
          order_index?: number
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_stages_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "learning_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_stages_i18n: {
        Row: {
          created_at: string
          description: string | null
          id: string
          language_code: string
          name: string
          source_name: string | null
          stage_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          language_code: string
          name: string
          source_name?: string | null
          stage_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          name?: string
          source_name?: string | null
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_stages_i18n_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "track_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_logs: {
        Row: {
          content_id: string | null
          course_id: string | null
          created_at: string
          estimated_bytes: number | null
          event_type: string
          id: string
          metadata: Json | null
          page_path: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          course_id?: string | null
          created_at?: string
          estimated_bytes?: number | null
          event_type: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          course_id?: string | null
          created_at?: string
          estimated_bytes?: number | null
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_translations: {
        Row: {
          created_at: string
          id: string
          key: string
          language_code: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          language_code: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          language_code?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_department_roles: {
        Row: {
          created_at: string | null
          department_id: string
          dept_role: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department_id: string
          dept_role: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string
          dept_role?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_department_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gamification: {
        Row: {
          created_at: string | null
          experience_points: number | null
          id: string
          last_activity_date: string | null
          level: number | null
          streak_days: number | null
          total_points: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          experience_points?: number | null
          id?: string
          last_activity_date?: string | null
          level?: number | null
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          experience_points?: number | null
          id?: string
          last_activity_date?: string | null
          level?: number | null
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          login_at: string
          logout_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          login_at?: string
          logout_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          login_at?: string
          logout_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      video_assets: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          file_size_mb: number | null
          id: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          uploaded_by: string
          video_provider: string
          video_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          file_size_mb?: number | null
          id?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
          video_provider?: string
          video_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          file_size_mb?: number | null
          id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
          video_provider?: string
          video_url?: string
        }
        Relationships: []
      }
      video_package_items: {
        Row: {
          content_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          language_code: string
          order_index: number
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_asset_id: string | null
          video_provider: string | null
          video_url: string
        }
        Insert: {
          content_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          language_code?: string
          order_index?: number
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_asset_id?: string | null
          video_provider?: string | null
          video_url: string
        }
        Update: {
          content_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          language_code?: string
          order_index?: number
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_asset_id?: string | null
          video_provider?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_package_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "course_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_package_items_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _dashboard_filter_ints: {
        Args: { p_filters: Json; p_key: string }
        Returns: number[]
      }
      _dashboard_filter_texts: {
        Args: { p_filters: Json; p_key: string }
        Returns: string[]
      }
      _dashboard_filter_uuids: {
        Args: { p_filters: Json; p_key: string }
        Returns: string[]
      }
      admin_course_stats: { Args: never; Returns: Json }
      admin_dashboard_insights: { Args: never; Returns: Json }
      admin_dashboard_summary: { Args: never; Returns: Json }
      admin_site_summary_today: { Args: never; Returns: Json }
      assign_track_to_department: {
        Args: { p_department_id: string; p_track_id: string }
        Returns: Json
      }
      assign_track_to_user: {
        Args: { p_track_id: string; p_user_id: string }
        Returns: Json
      }
      award_points: {
        Args: {
          p_action_type: string
          p_description?: string
          p_points: number
          p_user_id: string
        }
        Returns: undefined
      }
      can_view_assessment_i18n: {
        Args: { _assessment_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_assessment_question_i18n: {
        Args: { _question_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_award_badges: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      dashboard_access_heatmap: {
        Args: { p_filters?: Json; p_leader_id?: string }
        Returns: Json
      }
      dashboard_dropoff_courses: {
        Args: { p_filters?: Json; p_leader_id?: string; p_limit?: number }
        Returns: Json
      }
      dashboard_filtered_user_ids: {
        Args: { p_filters?: Json; p_leader_id?: string }
        Returns: {
          user_id: string
        }[]
      }
      dashboard_learner_details: {
        Args: {
          p_filters?: Json
          p_leader_id?: string
          p_limit?: number
          p_sort_by?: string
        }
        Returns: Json
      }
      dashboard_metrics: {
        Args: { p_filters?: Json; p_leader_id?: string }
        Returns: Json
      }
      dashboard_sparklines: { Args: { p_days?: number }; Returns: Json }
      dashboard_weekly_summary: {
        Args: { p_filters?: Json; p_leader_id?: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finalize_course_completion_if_eligible: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      get_assessment_questions_for_student: {
        Args: { p_assessment_id: string }
        Returns: {
          assessment_id: string
          hint: string
          id: string
          options: Json
          order_index: number
          points: number
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      get_assessment_questions_with_answers: {
        Args: { p_assessment_id: string }
        Returns: {
          assessment_id: string
          correct_answer: string
          explanation: string
          hint: string
          id: string
          options: Json
          order_index: number
          points: number
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      get_leader_scope_dept_ids: {
        Args: { _leader_id: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_course_completion_eligible: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_in_leader_scope: {
        Args: { _leader_id: string; _target_user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_course_review_completion: {
        Args: { p_course_id: string }
        Returns: number
      }
      submit_and_grade_assessment: {
        Args: { p_answers: Json; p_attempt_id: string }
        Returns: Json
      }
      sync_course_enrollment_progress: {
        Args: { _course_id: string; _user_id: string }
        Returns: undefined
      }
      update_streak: { Args: { p_user_id: string }; Returns: undefined }
      user_can_view_targeted_post: {
        Args: {
          _target_branch_ids: string[]
          _target_countries: string[]
          _target_course_ids: string[]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "super_admin"
      assignment_status: "draft" | "published" | "closed"
      attendance_status: "present" | "absent" | "late" | "excused"
      content_type:
        | "video"
        | "document"
        | "quiz"
        | "assignment"
        | "live"
        | "media_package"
        | "video_package"
      enrollment_status: "pending" | "approved" | "rejected"
      question_type:
        | "multiple_choice_4"
        | "multiple_choice_5"
        | "short_answer"
        | "essay"
        | "ox"
      submission_status: "submitted" | "graded" | "returned"
      survey_question_type: "multiple_choice" | "text" | "rating"
      video_provider: "youtube" | "vimeo" | "custom" | "upload"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "teacher", "student", "super_admin"],
      assignment_status: ["draft", "published", "closed"],
      attendance_status: ["present", "absent", "late", "excused"],
      content_type: [
        "video",
        "document",
        "quiz",
        "assignment",
        "live",
        "media_package",
        "video_package",
      ],
      enrollment_status: ["pending", "approved", "rejected"],
      question_type: [
        "multiple_choice_4",
        "multiple_choice_5",
        "short_answer",
        "essay",
        "ox",
      ],
      submission_status: ["submitted", "graded", "returned"],
      survey_question_type: ["multiple_choice", "text", "rating"],
      video_provider: ["youtube", "vimeo", "custom", "upload"],
    },
  },
} as const
