-- Transport cost capture: the driver records km + diesel spend at delivery
-- completion. Instruments the business's largest variable cost at the source.
alter table public.deliveries
  add column if not exists trip_km numeric check (trip_km >= 0),
  add column if not exists diesel_cost numeric check (diesel_cost >= 0);
