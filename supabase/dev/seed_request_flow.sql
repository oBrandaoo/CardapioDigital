-- DEVELOPMENT FIXTURE ONLY.
-- Do not run against a production project: this publishes a synthetic test profile,
-- activates its internal test license and opens a test performance.
-- The catalog items below are original chord-progression exercises created for this
-- demo. They contain no lyrics, recordings, third-party song titles or external charts.

begin;

do $$
declare
  test_musician_id uuid;
  test_slug text;
  test_performance_id uuid;
begin
  select user_record.id
    into test_musician_id
  from auth.users as user_record
  where lower(user_record.email) = 'rafaelbrandaoreis@gmail.com';

  if test_musician_id is null then
    raise exception 'Test musician rafaelbrandaoreis@gmail.com was not found. Invite/create that account first.';
  end if;

  select musician.slug
    into test_slug
  from public.musicians as musician
  where musician.id = test_musician_id;

  if test_slug is null then
    raise exception 'The test musician profile is missing.';
  end if;

  insert into public.catalog_songs (
    id, title, artist, composers, version_label, chord_sheet,
    authorization_reference, rights_basis, rights_status,
    rights_reviewed_at, rights_reviewed_by, created_by
  ) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'Demo grátis — Caminho em Dó',
    'Exercícios do Cardápio Musical',
    array['Conteúdo sintético interno'],
    'Progressão instrumental de demonstração',
    E'Intro\nC  G  Am  F\n\nParte A\nC  G  Am  F\n\nParte B\nF  G  C  C\n\nSem letra ou áudio; exercício harmônico original para testar pedidos.',
    'Exercício harmônico sintético criado para demonstração local do Cardápio Musical.',
    'Material demonstrativo original, sem letra, gravação, arranjo de terceiro ou vínculo com obra existente.',
    'approved',
    now(),
    test_musician_id,
    test_musician_id
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Demo paga — Ritmo em Ré',
    'Exercícios do Cardápio Musical',
    array['Conteúdo sintético interno'],
    'Progressão instrumental de demonstração',
    E'Intro\nD  A  Bm  G\n\nParte A\nD  A  Bm  G\n\nParte B\nG  A  D  D\n\nSem letra ou áudio; exercício harmônico original para testar pagamentos mock.',
    'Exercício harmônico sintético criado para demonstração local do Cardápio Musical.',
    'Material demonstrativo original, sem letra, gravação, arranjo de terceiro ou vínculo com obra existente.',
    'approved',
    now(),
    test_musician_id,
    test_musician_id
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Demo de R$ 5 — Ensaio em Sol',
    'Exercícios do Cardápio Musical',
    array['Conteúdo sintético interno'],
    'Progressão instrumental de demonstração',
    E'Intro\nG  D  Em  C\n\nParte A\nG  D  Em  C\n\nParte B\nC  D  G  G\n\nSem letra ou áudio; exercício harmônico original para testar o limite de preço.',
    'Exercício harmônico sintético criado para demonstração local do Cardápio Musical.',
    'Material demonstrativo original, sem letra, gravação, arranjo de terceiro ou vínculo com obra existente.',
    'approved',
    now(),
    test_musician_id,
    test_musician_id
  )
  on conflict (id) do update set
    title = excluded.title,
    artist = excluded.artist,
    composers = excluded.composers,
    version_label = excluded.version_label,
    chord_sheet = excluded.chord_sheet,
    authorization_reference = excluded.authorization_reference,
    rights_basis = excluded.rights_basis,
    rights_valid_until = null,
    rights_status = excluded.rights_status,
    rights_reviewed_at = excluded.rights_reviewed_at,
    rights_reviewed_by = excluded.rights_reviewed_by,
    updated_at = now();

  update public.musicians
  set profile_is_public = true,
      updated_at = now()
  where id = test_musician_id;

  insert into public.musician_licenses (musician_id, status, starts_at, ends_at, internal_note, granted_by)
  values (test_musician_id, 'active', now(), now() + interval '1 year', 'Ativação de demonstração local do fluxo de pedidos.', test_musician_id)
  on conflict (musician_id) do update set
    status = 'active',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    internal_note = excluded.internal_note,
    granted_by = excluded.granted_by,
    updated_at = now();

  insert into public.repertoire_items (musician_id, song_id, price_cents, is_enabled)
  values
    (test_musician_id, 'a1000000-0000-4000-8000-000000000001', 0, true),
    (test_musician_id, 'a1000000-0000-4000-8000-000000000002', 250, true),
    (test_musician_id, 'a1000000-0000-4000-8000-000000000003', 500, true)
  on conflict (musician_id, song_id) do update set
    price_cents = excluded.price_cents,
    is_enabled = true;

  select performance.id
    into test_performance_id
  from public.performances as performance
  where performance.musician_id = test_musician_id
    and performance.status = 'active'
  order by performance.starts_at desc
  limit 1;

  if test_performance_id is null then
    insert into public.performances (musician_id, title, status)
    values (test_musician_id, 'Apresentação local de teste', 'active')
    returning id into test_performance_id;
  end if;
end;
$$;

commit;

select musician.slug, musician.stage_name, performance.id as active_performance_id
from public.musicians as musician
join auth.users as user_record on user_record.id = musician.id
join public.performances as performance
  on performance.musician_id = musician.id
 and performance.status = 'active'
where lower(user_record.email) = 'rafaelbrandaoreis@gmail.com';
