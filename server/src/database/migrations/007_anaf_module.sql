-- Migration 007: ANAF SPV Monitor + e-Factura archivum module
-- Tarolja az ANAF SPV-bol leszedett uzeneteket es az ehhez tartozo
-- e-Factura szamlakat (parsed metadatumokkal).

CREATE TABLE IF NOT EXISTS anaf_messages (
    id VARCHAR(64) PRIMARY KEY,                     -- ANAF mesaj id (string)
    cif VARCHAR(20) NOT NULL,                       -- CUI a cegnek
    data_creare VARCHAR(40),                        -- ANAF data_creare (string format ahogy ANAF kuldte)
    tip VARCHAR(64),                                -- FACTURA PRIMITA, FACTURA TRIMISA, MESAJ, ERORI FACTURA
    detalii TEXT,
    id_solicitare VARCHAR(64),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,                        -- mikor kuldtuk el az emailt rola

    -- Mellekletek (ZIP)
    zip_path TEXT,
    zip_status VARCHAR(20) DEFAULT 'pending',       -- pending | downloaded | failed

    -- Kicsomagolt + generalt fajlok
    xml_path TEXT,
    pdf_path TEXT,

    -- e-Factura XML-bol kinyert metaadatok
    invoice_number VARCHAR(100),
    invoice_date DATE,
    invoice_due_date DATE,
    invoice_total DECIMAL(14, 2),
    invoice_currency VARCHAR(10),
    supplier_name VARCHAR(255),
    supplier_cif VARCHAR(50),
    customer_name VARCHAR(255),
    customer_cif VARCHAR(50),

    -- Raw uzenet a debugolashoz (eredeti ANAF JSON)
    raw_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_anaf_messages_data_creare ON anaf_messages(data_creare DESC);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_tip ON anaf_messages(tip);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_cif ON anaf_messages(cif);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_zip_status ON anaf_messages(zip_status);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_supplier_cif ON anaf_messages(supplier_cif);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_invoice_date ON anaf_messages(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_anaf_messages_invoice_due_date ON anaf_messages(invoice_due_date);

-- ANAF OAuth token tarolas (eddigi data/token.json helyett DB-ben)
-- Csak EGY soros tabla (1 token a rendszerhez), de tabla form sok ceg eseten kovetheto.
CREATE TABLE IF NOT EXISTS anaf_tokens (
    cif VARCHAR(20) PRIMARY KEY,                    -- a ceg CUI-ja amelyikhez tartozik
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    token_type VARCHAR(20) DEFAULT 'Bearer',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
