-- More per-person facts: native place / roots (मूळ गाव), gotra (गोत्र) and family deity (कुलदैवत).
-- Each is an ordinary dated, bilingual person_facts row, like occupation or residence.
alter type public.fact_type add value if not exists 'native_place';
alter type public.fact_type add value if not exists 'gotra';
alter type public.fact_type add value if not exists 'kuldaivat';
