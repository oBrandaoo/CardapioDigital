-- Provider records are separate from annual licenses. No real charge is
-- enabled by this migration. Only the service role may access these tables.

create table public.payment_recipients (
  musician_id uuid primary key references public.musicians (id) on delete cascade,
  provider text not null default 'pagarme' check (provider = 'pagarme'),
  provider_recipient_id text not null unique
    check (provider_recipient_id ~ '^rp_[A-Za-z0-9]+$'),
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'active', 'suspended', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.music_requests (id) on delete restrict,
  provider text not null default 'pagarme' check (provider = 'pagarme'),
  provider_order_id text unique check (
    provider_order_id is null or provider_order_id ~ '^or_[A-Za-z0-9]+$'
  ),
  amount_cents integer not null check (amount_cents between 1 and 500),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'preparing'
    check (status in ('preparing', 'pending', 'paid', 'failed', 'refunded')),
  -- Populate these only after the fiscal and fee policies are approved.
  tax_cents integer check (tax_cents is null or tax_cents between 0 and amount_cents),
  platform_share_cents integer check (platform_share_cents is null or platform_share_cents >= 0),
  musician_share_cents integer check (musician_share_cents is null or musician_share_cents >= 0),
  provider_fee_cents integer check (provider_fee_cents is null or provider_fee_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settled_shares_complete check (
    (tax_cents is null and platform_share_cents is null and musician_share_cents is null)
    or (tax_cents is not null and platform_share_cents is not null
        and musician_share_cents is not null
        and platform_share_cents + musician_share_cents + tax_cents = amount_cents
        and abs(platform_share_cents - musician_share_cents) <= 1)
  ),
  constraint provider_order_required check (
    status = 'preparing' or provider_order_id is not null
  ),
  constraint paid_allocation_required check (
    status <> 'paid' or tax_cents is not null
  )
);

create index request_payment_attempts_status_idx
  on public.request_payment_attempts (status, created_at);

create or replace function private.check_request_payment_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_price integer;
  request_payment_status text;
begin
  select price_cents, payment_status
    into request_price, request_payment_status
  from public.music_requests
  where id = new.request_id;

  if request_price is null or request_price = 0
    or request_price <> new.amount_cents
    or request_payment_status = 'not_required' then
    raise exception using errcode = '23514', message = 'Payment amount does not match paid request';
  end if;
  return new;
end;
$$;

revoke all on function private.check_request_payment_amount() from public;
create trigger check_request_payment_amount_before_write
  before insert or update of request_id, amount_cents
  on public.request_payment_attempts
  for each row execute function private.check_request_payment_amount();

create table public.payment_provider_events (
  provider text not null default 'pagarme' check (provider = 'pagarme'),
  provider_event_id text not null,
  provider_order_id text,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, provider_event_id)
);

alter table public.payment_recipients enable row level security;
alter table public.request_payment_attempts enable row level security;
alter table public.payment_provider_events enable row level security;
revoke all on public.payment_recipients from public, anon, authenticated;
revoke all on public.request_payment_attempts from public, anon, authenticated;
revoke all on public.payment_provider_events from public, anon, authenticated;

comment on table public.request_payment_attempts is
  'One provider payment per paid music request; separate from internal annual licenses.';
comment on column public.request_payment_attempts.provider_fee_cents is
  'Gateway fee, never treated as tax or silently deducted from the 50/50 base.';
