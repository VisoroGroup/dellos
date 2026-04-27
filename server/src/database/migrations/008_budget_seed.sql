-- Migration 008: Budget categories seed (from Penzugyi Tervezes Malaga.xlsx, in Romanian)

-- Add is_deduction flag (categories that subtract from revenue to get "Venit corectat")
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS is_deduction BOOLEAN DEFAULT FALSE;

-- Section "venituri" — Venituri și deduceri
INSERT INTO budget_categories (id, name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('b0000001-0000-4000-8000-000000000001', 'Valoare facturată',  'venituri', 'Venituri și deduceri', NULL, 0, TRUE,  FALSE),
  ('b0000001-0000-4000-8000-000000000002', 'Parteneri',           'venituri', 'Venituri și deduceri', NULL, 1, FALSE, TRUE),
  ('b0000001-0000-4000-8000-000000000003', 'TVA',                 'venituri', 'Venituri și deduceri', NULL, 2, FALSE, TRUE),
  ('b0000001-0000-4000-8000-000000000004', 'Rezervă firmă',       'venituri', 'Venituri și deduceri', NULL, 3, FALSE, TRUE);

-- Children of "Rezervă firmă"
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Fond proprietar',     'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 0, FALSE, TRUE),
  ('Avocat',              'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 1, FALSE, TRUE),
  ('Eșalonare',           'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 2, FALSE, TRUE),
  ('Suni',                'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 3, FALSE, TRUE),
  ('Bonusuri parteneri',  'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 4, FALSE, TRUE),
  ('Performia',           'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 5, FALSE, TRUE),
  ('Fari',                'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 6, FALSE, TRUE),
  ('Arobs GPS',           'venituri', 'Venituri și deduceri', 'b0000001-0000-4000-8000-000000000004', 7, FALSE, TRUE);

-- Section "sectiunea1" — 1. Comunicare + HR
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Administrator',                                                              'sectiunea1', '1. Comunicare + HR', NULL, 0,  FALSE, FALSE),
  ('Birou (chirie, consumabile, gaz, curent, tot ce ține de birou)',             'sectiunea1', '1. Comunicare + HR', NULL, 1,  FALSE, FALSE),
  ('Testări (inovație + softuri + produs nou)',                                  'sectiunea1', '1. Comunicare + HR', NULL, 2,  FALSE, FALSE),
  ('Diurne',                                                                      'sectiunea1', '1. Comunicare + HR', NULL, 3,  FALSE, FALSE),
  ('Cazări',                                                                      'sectiunea1', '1. Comunicare + HR', NULL, 4,  FALSE, FALSE),
  ('Abonamente',                                                                  'sectiunea1', '1. Comunicare + HR', NULL, 5,  FALSE, FALSE),
  ('Salarii',                                                                     'sectiunea1', '1. Comunicare + HR', NULL, 6,  FALSE, FALSE),
  ('Bonusuri',                                                                    'sectiunea1', '1. Comunicare + HR', NULL, 7,  FALSE, FALSE),
  ('Protocol intern',                                                             'sectiunea1', '1. Comunicare + HR', NULL, 8,  FALSE, FALSE),
  ('Magazin',                                                                     'sectiunea1', '1. Comunicare + HR', NULL, 9,  FALSE, FALSE),
  ('Impozit pe salarii',                                                          'sectiunea1', '1. Comunicare + HR', NULL, 10, FALSE, FALSE),
  ('Dividende',                                                                   'sectiunea1', '1. Comunicare + HR', NULL, 11, FALSE, FALSE),
  ('Asigurări',                                                                   'sectiunea1', '1. Comunicare + HR', NULL, 12, FALSE, FALSE),
  ('Vodafone',                                                                    'sectiunea1', '1. Comunicare + HR', NULL, 13, FALSE, FALSE),
  ('Costuri poștă',                                                               'sectiunea1', '1. Comunicare + HR', NULL, 14, FALSE, FALSE),
  ('Aplicație',                                                                   'sectiunea1', '1. Comunicare + HR', NULL, 15, FALSE, FALSE);

-- Section "sectiunea2" — 2. Vânzări + Marketing
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Mașini (leasing + carburant + spălare + taxe drum)', 'sectiunea2', '2. Vânzări + Marketing', NULL, 0, FALSE, FALSE),
  ('Promoții',                                            'sectiunea2', '2. Vânzări + Marketing', NULL, 1, FALSE, FALSE),
  ('Protocol extern',                                     'sectiunea2', '2. Vânzări + Marketing', NULL, 2, FALSE, FALSE);

-- Section "sectiunea3" — 3. Finanțe
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Contabilitate',     'sectiunea3', '3. Finanțe', NULL, 0, FALSE, FALSE),
  ('Rate bancare',      'sectiunea3', '3. Finanțe', NULL, 1, FALSE, FALSE),
  ('Costuri bancare',   'sectiunea3', '3. Finanțe', NULL, 2, FALSE, FALSE),
  ('Mijloace fixe',     'sectiunea3', '3. Finanțe', NULL, 3, FALSE, FALSE),
  ('Impozit auto',      'sectiunea3', '3. Finanțe', NULL, 4, FALSE, FALSE),
  ('Impozit pe profit', 'sectiunea3', '3. Finanțe', NULL, 5, FALSE, FALSE);

-- Section "sectiunea5" — 5. Calitate
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Curățenie birou', 'sectiunea5', '5. Calitate', NULL, 0, FALSE, FALSE),
  ('PSI',             'sectiunea5', '5. Calitate', NULL, 1, FALSE, FALSE),
  ('Formare',         'sectiunea5', '5. Calitate', NULL, 2, FALSE, FALSE),
  ('SSM',             'sectiunea5', '5. Calitate', NULL, 3, FALSE, FALSE);

-- Section "sectiunea6" — 6. Extindere
INSERT INTO budget_categories (name, section, section_label, parent_id, order_index, is_revenue, is_deduction) VALUES
  ('Evenimente', 'sectiunea6', '6. Extindere', NULL, 0, FALSE, FALSE);
