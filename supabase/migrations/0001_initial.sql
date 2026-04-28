-- =============================================================================
-- DermAI — Initial Schema Migration
-- Run this in the Supabase SQL editor (or via Supabase CLI).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- profiles: one row per authenticated user
CREATE TABLE public.profiles (
    id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text,
    avatar_url  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- scans: skin analysis results
CREATE TABLE public.scans (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    result_json jsonb       NOT NULL,
    image_urls  text[]      -- nullable; filled in Phase 2
);

-- favorites: saved products
CREATE TABLE public.favorites (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id  text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_id)
);

-- routine_logs: daily AM/PM checklist
CREATE TABLE public.routine_logs (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date    date        NOT NULL,
    am_done     boolean     NOT NULL DEFAULT false,
    pm_done     boolean     NOT NULL DEFAULT false,
    UNIQUE (user_id, log_date)
);

-- reactions: user reactions to products
CREATE TABLE public.reactions (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id  text        NOT NULL,
    severity    int         NOT NULL CHECK (severity BETWEEN 1 AND 5),
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions    ENABLE ROW LEVEL SECURITY;

-- profiles: users manage their own profile row (keyed on id, not user_id)
CREATE POLICY "Users can manage their own profile"
    ON public.profiles
    FOR ALL
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- scans: users manage their own scan rows
CREATE POLICY "Users can manage their own scans"
    ON public.scans
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- favorites: users manage their own favorites
CREATE POLICY "Users can manage their own favorites"
    ON public.favorites
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- routine_logs: users manage their own routine logs
CREATE POLICY "Users can manage their own routine logs"
    ON public.routine_logs
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- reactions: users manage their own reactions
CREATE POLICY "Users can manage their own reactions"
    ON public.reactions
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. TRIGGER — auto-create profile on sign-up
-- ---------------------------------------------------------------------------

-- Function: called after a new row is inserted into auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'avatar_url'
    );
    RETURN NEW;
END;
$$;

-- Trigger: fire after every INSERT on auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
