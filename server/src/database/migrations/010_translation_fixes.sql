-- Migration 010: Romanian translation fixes for budget categories

UPDATE budget_categories SET name = 'Servicii juridice' WHERE name = 'Avocat';

UPDATE budget_categories SET name = 'Sediu (chirie, consumabile, gaz, curent, tot ce ține de sediu)' WHERE name LIKE 'Birou%';
