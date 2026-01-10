-- Seed factory settings with Red Hills, Chennai location
INSERT INTO public.factory_settings (name, latitude, longitude, address, transport_rate_per_km, min_transport_charge)
VALUES (
  'Maiyuri Bricks Factory',
  13.1649,
  80.1816,
  'Red Hills, Chennai, Tamil Nadu, India',
  15.00,
  500.00
)
ON CONFLICT DO NOTHING;
