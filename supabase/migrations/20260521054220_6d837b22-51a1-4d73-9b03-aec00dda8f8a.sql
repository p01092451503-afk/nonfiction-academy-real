
-- Employees
CREATE TABLE public.migration_employees (
  employee_id   INTEGER PRIMARY KEY,
  country       TEXT NOT NULL CHECK (country IN ('KR','JP','HK','US')),
  store         TEXT,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  position      TEXT,
  start_date    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.migration_courses (
  course_id     INTEGER PRIMARY KEY,
  country       TEXT NOT NULL CHECK (country IN ('KR','JP','HK','US')),
  year          INTEGER NOT NULL CHECK (year IN (2025, 2026)),
  course_name   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.migration_completions (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES public.migration_employees(employee_id) ON DELETE CASCADE,
  course_id     INTEGER NOT NULL REFERENCES public.migration_courses(course_id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('completed','not_completed','in_progress','not_assigned','on_leave')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, course_id)
);

CREATE INDEX idx_mig_employees_country ON public.migration_employees(country);
CREATE INDEX idx_mig_employees_store ON public.migration_employees(store);
CREATE INDEX idx_mig_employees_position ON public.migration_employees(position);
CREATE INDEX idx_mig_completions_employee ON public.migration_completions(employee_id);
CREATE INDEX idx_mig_completions_course ON public.migration_completions(course_id);
CREATE INDEX idx_mig_completions_status ON public.migration_completions(status);

ALTER TABLE public.migration_employees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_completions ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin/teacher view; admin/super_admin manage
CREATE POLICY "Staff can view migration employees"
  ON public.migration_employees FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'teacher'));
CREATE POLICY "Admins manage migration employees"
  ON public.migration_employees FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));

CREATE POLICY "Staff can view migration courses"
  ON public.migration_courses FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'teacher'));
CREATE POLICY "Admins manage migration courses"
  ON public.migration_courses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));

CREATE POLICY "Staff can view migration completions"
  ON public.migration_completions FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'teacher'));
CREATE POLICY "Admins manage migration completions"
  ON public.migration_completions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
