-- ==============================================================================
-- 004_smart_incubation_system.sql
-- Safe Non-Destructive Migration: Smart Incubation Centre Management System
--
-- Adds:
-- 1. Projects & Teams management with strict title protection
-- 2. Permanent Achievements & Configurable Announcements
-- 3. Complaints System (Equipment/Environment & Component shortages)
-- 4. Research Papers metadata with public/private toggle
-- 5. Student Self-Affirmation & Reflection Book
-- 6. Innovation Day & Centre Events
-- 7. Holidays & Working-Day Streak tracking
-- 8. Domains management
-- 9. Staff / Sir "I'm Inside Lab" presence tracking
-- 10. Nested category & unique component number on components
-- ==============================================================================

-- 1. ADD COLUMNS TO USERS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS branch text DEFAULT 'ECE';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS section text DEFAULT 'A';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS academic_year integer DEFAULT 3;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_theme text DEFAULT 'indigo';

-- 2. ADD COLUMNS TO COMPONENTS
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS component_number text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS parent_category text;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS location_details text;

-- Create unique index on component_number where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_components_component_number_unique 
  ON public.components (LOWER(TRIM(component_number))) 
  WHERE component_number IS NOT NULL AND component_number != '';

-- 3. DOMAINS TABLE
CREATE TABLE IF NOT EXISTS public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now()
);

-- 4. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  team_id text,
  leader_roll text NOT NULL,
  members jsonb DEFAULT '[]'::jsonb,
  objectives text,
  domain text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'in_progress')),
  github_link text,
  linkedin_link text,
  budget numeric(10, 2) DEFAULT 0,
  prototype_available boolean DEFAULT false,
  title_change_request jsonb, -- Stores pending student title requests for Sir/Admin approval
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_leader_roll ON public.projects (leader_roll);
CREATE INDEX IF NOT EXISTS idx_projects_domain ON public.projects (domain);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);

-- 5. TEAMS TABLE
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_roll text NOT NULL,
  member_rolls jsonb DEFAULT '[]'::jsonb,
  domain text,
  project_id uuid,
  budget numeric(10, 2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- 6. PERMANENT ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  awarded_to_roll text NOT NULL,
  student_name text NOT NULL,
  prize_money numeric(10, 2) DEFAULT 0,
  awarded_by text NOT NULL,
  date_awarded date DEFAULT CURRENT_DATE,
  is_permanent boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievements_student ON public.achievements (awarded_to_roll);

-- 7. ANNOUNCEMENTS TABLE (Configurable 2-3 day expiration)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  category text DEFAULT 'General',
  active boolean DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements (active, expires_at);

-- 8. EVENTS & INNOVATION DAY TABLE
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  theme text,
  event_date date NOT NULL,
  prizes text,
  winners jsonb DEFAULT '[]'::jsonb,
  is_innovation_day boolean DEFAULT false,
  year integer,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (event_date);

-- 9. COMPLAINTS TABLE (Equipment/Environment & Component shortages)
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('equipment_environment', 'component_availability')),
  item_name text NOT NULL,
  description text NOT NULL,
  reported_by_roll text NOT NULL,
  reported_by_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_reported_by ON public.complaints (reported_by_roll);

-- 10. RESEARCH PAPERS TABLE (Metadata only, DOI / External link, public/private toggle)
CREATE TABLE IF NOT EXISTS public.research_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  authors jsonb DEFAULT '[]'::jsonb,
  student_roll text NOT NULL,
  team_name text,
  domain text,
  venue text,
  paper_type text DEFAULT 'conference' CHECK (paper_type IN ('IEEE', 'conference', 'journal', 'workshop', 'other')),
  doi text,
  external_url text,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_student ON public.research_papers (student_roll);
CREATE INDEX IF NOT EXISTS idx_research_domain ON public.research_papers (domain);

-- 11. SELF-AFFIRMATION / STUDENT REFLECTION BOOK
CREATE TABLE IF NOT EXISTS public.self_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_roll text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_private boolean DEFAULT true,
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reflections_student ON public.self_reflections (student_roll);

-- 12. HOLIDAYS TABLE (For accurate working-day streak computation)
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  type text DEFAULT 'institute' CHECK (type IN ('sunday', 'institute', 'national', 'festival')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays (date);

-- 13. STAFF / SIR "I'M INSIDE LAB" PRESENCE TRACKING
CREATE TABLE IF NOT EXISTS public.staff_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_email text NOT NULL,
  staff_name text NOT NULL,
  role text NOT NULL,
  entry_time timestamptz NOT NULL DEFAULT now(),
  exit_time timestamptz,
  duration_minutes integer,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_presence_active ON public.staff_presence (active, staff_email);

-- ENABLE ROW LEVEL SECURITY SAFELY
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_presence ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE RLS POLICIES FOR READING PUBLIC / ACTIVE CONTENT
DO $$
BEGIN
  -- Read policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on domains') THEN
    CREATE POLICY "Allow public read on domains" ON public.domains FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on projects') THEN
    CREATE POLICY "Allow public read on projects" ON public.projects FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on teams') THEN
    CREATE POLICY "Allow public read on teams" ON public.teams FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on achievements') THEN
    CREATE POLICY "Allow public read on achievements" ON public.achievements FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on announcements') THEN
    CREATE POLICY "Allow public read on announcements" ON public.announcements FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on events') THEN
    CREATE POLICY "Allow public read on events" ON public.events FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on holidays') THEN
    CREATE POLICY "Allow public read on holidays" ON public.holidays FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read on staff_presence') THEN
    CREATE POLICY "Allow public read on staff_presence" ON public.staff_presence FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read on research papers') THEN
    CREATE POLICY "Allow read on research papers" ON public.research_papers FOR SELECT USING (is_public = true OR auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read on complaints') THEN
    CREATE POLICY "Allow authenticated read on complaints" ON public.complaints FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read on self_reflections') THEN
    CREATE POLICY "Allow authenticated read on self_reflections" ON public.self_reflections FOR SELECT USING (true);
  END IF;

  -- Insert/Update policies for authenticated/anon client offline-first compatibility
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert on complaints') THEN
    CREATE POLICY "Allow insert on complaints" ON public.complaints FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write on projects') THEN
    CREATE POLICY "Allow write on projects" ON public.projects FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write on research papers') THEN
    CREATE POLICY "Allow write on research papers" ON public.research_papers FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write on self_reflections') THEN
    CREATE POLICY "Allow write on self_reflections" ON public.self_reflections FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow write on staff_presence') THEN
    CREATE POLICY "Allow write on staff_presence" ON public.staff_presence FOR ALL USING (true);
  END IF;
END $$;
