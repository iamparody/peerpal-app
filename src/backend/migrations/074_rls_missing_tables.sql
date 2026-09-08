-- Enable RLS on tables added after the initial RLS migrations
-- Backend uses service role key (bypasses RLS) so no policies needed
-- Enabling RLS alone blocks direct PostgREST access via the anon key

ALTER TABLE public.group_reactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_polls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_poll_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_poll_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config     ENABLE ROW LEVEL SECURITY;
