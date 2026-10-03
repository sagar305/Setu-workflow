-- CHECK constraints treat NULL as unknown; explicitly require both year-end components.
ALTER TABLE clients DROP CONSTRAINT clients_year_end_valid;
ALTER TABLE clients ADD CONSTRAINT clients_year_end_valid CHECK (
  (tax_year_end_month IS NULL AND tax_year_end_day IS NULL)
  OR (
    tax_year_end_month IS NOT NULL AND tax_year_end_day IS NOT NULL
    AND tax_year_end_month BETWEEN 1 AND 12
    AND tax_year_end_day BETWEEN 1 AND CASE
      WHEN tax_year_end_month = 2 THEN 29
      WHEN tax_year_end_month IN (4,6,9,11) THEN 30
      ELSE 31 END
  )
);
