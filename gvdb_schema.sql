--
-- PostgreSQL database dump
--

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: cleanup_album_performers_on_segment_delete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_album_performers_on_segment_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.type = 'segment' AND OLD.parent_id IS NOT NULL THEN
        -- 更新父专辅的演员列表
        UPDATE productions
        SET performer_ids = COALESCE(
            (SELECT array_agg(DISTINCT perf.stage_name_id)
             FROM productions seg
             JOIN performances perf ON perf.production_id = seg.id
             WHERE seg.parent_id = OLD.parent_id AND seg.type = 'segment'),
            '{}'::INTEGER[]
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.parent_id AND type = 'album';
    END IF;

    RETURN OLD;
END;
$$;


ALTER FUNCTION public.cleanup_album_performers_on_segment_delete() OWNER TO postgres;

--
-- Name: sync_album_performers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_album_performers() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    local_production_id INTEGER;
    parent_album_id INTEGER;
BEGIN
    -- 获取这个 performance 所属的作品 ID
    IF TG_OP = 'DELETE' THEN
        local_production_id := OLD.production_id;
    ELSE
        local_production_id := NEW.production_id;
    END IF;

    -- 第一步：更新这个作品本身的 performer_ids（无论是 single、segment 还是 album）
    UPDATE productions
    SET performer_ids = COALESCE(
        (SELECT array_agg(DISTINCT stage_name_id)
         FROM performances
         WHERE production_id = local_production_id),
        '{}'::INTEGER[]
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = local_production_id;

    -- 第二步：如果这个作品是片段，还要更新其父专辅
    SELECT parent_id INTO parent_album_id
    FROM productions
    WHERE id = local_production_id;

    IF parent_album_id IS NOT NULL THEN
        UPDATE productions
        SET performer_ids = COALESCE(
            (SELECT array_agg(DISTINCT perf.stage_name_id)
             FROM productions seg
             JOIN performances perf ON perf.production_id = seg.id
             WHERE seg.parent_id = parent_album_id AND seg.type = 'segment'),
            '{}'::INTEGER[]
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = parent_album_id AND type = 'album';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION public.sync_album_performers() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: actors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.actors (
    id integer NOT NULL,
    actor_tag character varying(100) NOT NULL,
    gvdb_id character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.actors OWNER TO postgres;

--
-- Name: actors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.actors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.actors_id_seq OWNER TO postgres;

--
-- Name: actors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.actors_id_seq OWNED BY public.actors.id;


--
-- Name: performances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performances (
    id integer NOT NULL,
    production_id integer,
    stage_name_id integer,
    role character varying(20),
    performer_type character varying(20) DEFAULT 'named'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT performances_performer_type_check CHECK (((performer_type)::text = ANY ((ARRAY['named'::character varying, 'anonymous'::character varying, 'masked'::character varying, 'pov_only'::character varying])::text[]))),
    CONSTRAINT performances_role_check CHECK (((role)::text = ANY ((ARRAY['top'::character varying, 'bottom'::character varying, 'receiver'::character varying, 'giver'::character varying, NULL::character varying])::text[])))
);


ALTER TABLE public.performances OWNER TO postgres;

--
-- Name: production_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.production_tags (
    production_id integer NOT NULL,
    tag_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.production_tags OWNER TO postgres;

--
-- Name: productions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.productions (
    id integer NOT NULL,
    code character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    parent_id integer,
    studio_id integer,
    title text,
    release_date character varying(10),
    comment text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    performer_ids integer[],
    CONSTRAINT non_segment_must_have_date CHECK ((((type)::text = 'segment'::text) OR (release_date IS NOT NULL))),
    CONSTRAINT non_segment_must_have_studio CHECK ((((type)::text = 'segment'::text) OR (studio_id IS NOT NULL))),
    CONSTRAINT productions_type_check CHECK (((type)::text = ANY ((ARRAY['single'::character varying, 'album'::character varying, 'segment'::character varying])::text[]))),
    CONSTRAINT segment_must_have_parent CHECK ((((type)::text <> 'segment'::text) OR (parent_id IS NOT NULL)))
);


ALTER TABLE public.productions OWNER TO postgres;

--
-- Name: COLUMN productions.performer_ids; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.productions.performer_ids IS 'Array of stage_name_ids for all performers in this production. For album: union of all segment performers. For single/segment: direct performers.';


--
-- Name: stage_names; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stage_names (
    id integer NOT NULL,
    actor_id integer,
    studio_id integer,
    stage_name character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.stage_names OWNER TO postgres;

--
-- Name: studios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.studios (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    country character varying(100),
    website character varying(500),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.studios OWNER TO postgres;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    category character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tags OWNER TO postgres;

--
-- Name: notion_export; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.notion_export AS
 SELECT p.id,
    p.code,
    s.name AS publisher,
    p.title,
    p.release_date AS date,
    p.type,
        CASE
            WHEN ((p.type)::text = 'segment'::text) THEN ( SELECT parent.code
               FROM public.productions parent
              WHERE (parent.id = p.parent_id))
            ELSE NULL::character varying
        END AS parent_code,
    ( SELECT string_agg(((
                CASE
                    WHEN ((perf.performer_type)::text = 'anonymous'::text) THEN '墨鏡男'::character varying
                    WHEN ((perf.performer_type)::text = 'masked'::text) THEN '蒙面男'::character varying
                    ELSE sn.stage_name
                END)::text ||
                CASE
                    WHEN (perf.role IS NOT NULL) THEN ((' ('::text || (perf.role)::text) || ')'::text)
                    ELSE ''::text
                END), ' x '::text ORDER BY
                CASE perf.role
                    WHEN 'top'::text THEN 1
                    WHEN 'giver'::text THEN 2
                    WHEN 'receiver'::text THEN 3
                    WHEN 'bottom'::text THEN 4
                    ELSE 5
                END) AS string_agg
           FROM (public.performances perf
             LEFT JOIN public.stage_names sn ON ((perf.stage_name_id = sn.id)))
          WHERE (perf.production_id = p.id)) AS actors,
    ( SELECT string_agg(DISTINCT (t.name)::text, ', '::text ORDER BY (t.name)::text) AS string_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'source'::text))) AS source,
    ( SELECT string_agg(DISTINCT (t.name)::text, ', '::text ORDER BY (t.name)::text) AS string_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'sex_act'::text))) AS sex_acts,
    ( SELECT string_agg(DISTINCT (t.name)::text, ', '::text ORDER BY (t.name)::text) AS string_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'style'::text))) AS styles,
    ( SELECT string_agg(DISTINCT (t.name)::text, ', '::text ORDER BY (t.name)::text) AS string_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'body_type'::text))) AS body_types,
    p.comment
   FROM (public.productions p
     LEFT JOIN public.studios s ON ((p.studio_id = s.id)));


ALTER VIEW public.notion_export OWNER TO postgres;

--
-- Name: performances_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.performances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.performances_id_seq OWNER TO postgres;

--
-- Name: performances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.performances_id_seq OWNED BY public.performances.id;


--
-- Name: production_search_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.production_search_view AS
 SELECT p.id,
    p.code,
    p.type,
    p.parent_id,
    p.studio_id,
    s.name AS studio,
    p.title,
    p.release_date,
    p.comment,
        CASE
            WHEN (((p.type)::text = 'album'::text) AND (p.performer_ids IS NOT NULL) AND (array_length(p.performer_ids, 1) > 0)) THEN ( SELECT string_agg((sn.stage_name)::text, ' / '::text ORDER BY (sn.stage_name)::text) AS string_agg
               FROM public.stage_names sn
              WHERE (sn.id = ANY (p.performer_ids)))
            WHEN ((p.performer_ids IS NOT NULL) AND (array_length(p.performer_ids, 1) > 0)) THEN ( SELECT string_agg((sn.stage_name)::text, ' / '::text ORDER BY
                    CASE perf.role
                        WHEN 'top'::text THEN 1
                        WHEN 'giver'::text THEN 2
                        WHEN 'receiver'::text THEN 3
                        WHEN 'bottom'::text THEN 4
                        ELSE 5
                    END) AS string_agg
               FROM (public.stage_names sn
                 JOIN public.performances perf ON ((sn.id = perf.stage_name_id)))
              WHERE ((sn.id = ANY (p.performer_ids)) AND (perf.production_id = p.id)))
            ELSE NULL::text
        END AS performers_display,
    p.performer_ids,
    ( SELECT array_agg(DISTINCT t.name ORDER BY t.name) AS array_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'sex_act'::text))) AS sex_acts,
    ( SELECT array_agg(DISTINCT t.name ORDER BY t.name) AS array_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'style'::text))) AS styles,
    ( SELECT array_agg(DISTINCT t.name ORDER BY t.name) AS array_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'body_type'::text))) AS body_types,
    ( SELECT array_agg(DISTINCT t.name ORDER BY t.name) AS array_agg
           FROM (public.production_tags pt
             JOIN public.tags t ON ((pt.tag_id = t.id)))
          WHERE ((pt.production_id = p.id) AND ((t.category)::text = 'source'::text))) AS sources
   FROM (public.productions p
     LEFT JOIN public.studios s ON ((p.studio_id = s.id)));


ALTER VIEW public.production_search_view OWNER TO postgres;

--
-- Name: productions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.productions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productions_id_seq OWNER TO postgres;

--
-- Name: productions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.productions_id_seq OWNED BY public.productions.id;


--
-- Name: stage_names_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stage_names_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stage_names_id_seq OWNER TO postgres;

--
-- Name: stage_names_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stage_names_id_seq OWNED BY public.stage_names.id;


--
-- Name: studios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.studios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.studios_id_seq OWNER TO postgres;

--
-- Name: studios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.studios_id_seq OWNED BY public.studios.id;


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tags_id_seq OWNER TO postgres;

--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: actors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.actors ALTER COLUMN id SET DEFAULT nextval('public.actors_id_seq'::regclass);


--
-- Name: performances id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performances ALTER COLUMN id SET DEFAULT nextval('public.performances_id_seq'::regclass);


--
-- Name: productions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productions ALTER COLUMN id SET DEFAULT nextval('public.productions_id_seq'::regclass);


--
-- Name: stage_names id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_names ALTER COLUMN id SET DEFAULT nextval('public.stage_names_id_seq'::regclass);


--
-- Name: studios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.studios ALTER COLUMN id SET DEFAULT nextval('public.studios_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: actors actors_actor_tag_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.actors
    ADD CONSTRAINT actors_actor_tag_key UNIQUE (actor_tag);


--
-- Name: actors actors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.actors
    ADD CONSTRAINT actors_pkey PRIMARY KEY (id);


--
-- Name: performances performances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performances
    ADD CONSTRAINT performances_pkey PRIMARY KEY (id);


--
-- Name: performances performances_production_id_stage_name_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performances
    ADD CONSTRAINT performances_production_id_stage_name_id_key UNIQUE (production_id, stage_name_id);


--
-- Name: production_tags production_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_tags
    ADD CONSTRAINT production_tags_pkey PRIMARY KEY (production_id, tag_id);


--
-- Name: productions productions_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_code_key UNIQUE (code);


--
-- Name: productions productions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_pkey PRIMARY KEY (id);


--
-- Name: stage_names stage_names_actor_id_studio_id_stage_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_names
    ADD CONSTRAINT stage_names_actor_id_studio_id_stage_name_key UNIQUE (actor_id, studio_id, stage_name);


--
-- Name: stage_names stage_names_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_names
    ADD CONSTRAINT stage_names_pkey PRIMARY KEY (id);


--
-- Name: studios studios_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.studios
    ADD CONSTRAINT studios_name_key UNIQUE (name);


--
-- Name: studios studios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.studios
    ADD CONSTRAINT studios_pkey PRIMARY KEY (id);


--
-- Name: tags tags_category_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_category_name_key UNIQUE (category, name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: idx_performances_production_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_performances_production_id ON public.performances USING btree (production_id);


--
-- Name: idx_performances_stage_name_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_performances_stage_name_id ON public.performances USING btree (stage_name_id);


--
-- Name: idx_production_tags_production; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_tags_production ON public.production_tags USING btree (production_id);


--
-- Name: idx_production_tags_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_tags_tag ON public.production_tags USING btree (tag_id);


--
-- Name: idx_productions_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productions_parent_id ON public.productions USING btree (parent_id);


--
-- Name: idx_productions_performer_ids; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productions_performer_ids ON public.productions USING gin (performer_ids);


--
-- Name: idx_productions_studio_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productions_studio_id ON public.productions USING btree (studio_id);


--
-- Name: idx_productions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productions_type ON public.productions USING btree (type);


--
-- Name: idx_stage_names_actor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stage_names_actor_id ON public.stage_names USING btree (actor_id);


--
-- Name: idx_stage_names_studio_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stage_names_studio_id ON public.stage_names USING btree (studio_id);


--
-- Name: performances performances_sync_album_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER performances_sync_album_delete AFTER DELETE ON public.performances FOR EACH ROW EXECUTE FUNCTION public.sync_album_performers();


--
-- Name: performances performances_sync_album_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER performances_sync_album_insert AFTER INSERT ON public.performances FOR EACH ROW EXECUTE FUNCTION public.sync_album_performers();


--
-- Name: performances performances_sync_album_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER performances_sync_album_update AFTER UPDATE ON public.performances FOR EACH ROW EXECUTE FUNCTION public.sync_album_performers();


--
-- Name: productions productions_cleanup_album_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER productions_cleanup_album_delete BEFORE DELETE ON public.productions FOR EACH ROW EXECUTE FUNCTION public.cleanup_album_performers_on_segment_delete();


--
-- Name: performances performances_production_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performances
    ADD CONSTRAINT performances_production_id_fkey FOREIGN KEY (production_id) REFERENCES public.productions(id) ON DELETE CASCADE;


--
-- Name: performances performances_stage_name_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performances
    ADD CONSTRAINT performances_stage_name_id_fkey FOREIGN KEY (stage_name_id) REFERENCES public.stage_names(id) ON DELETE CASCADE;


--
-- Name: production_tags production_tags_production_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_tags
    ADD CONSTRAINT production_tags_production_id_fkey FOREIGN KEY (production_id) REFERENCES public.productions(id) ON DELETE CASCADE;


--
-- Name: production_tags production_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_tags
    ADD CONSTRAINT production_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: productions productions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.productions(id);


--
-- Name: productions productions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productions
    ADD CONSTRAINT productions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id);


--
-- Name: stage_names stage_names_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_names
    ADD CONSTRAINT stage_names_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.actors(id) ON DELETE CASCADE;


--
-- Name: stage_names stage_names_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_names
    ADD CONSTRAINT stage_names_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

