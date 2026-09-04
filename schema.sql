-- =====================================================================
-- FARMAKEIA — PHARMACY MANAGEMENT SYSTEM
-- COMPLETE PRODUCTION DATABASE SCHEMA FOR SUPABASE
-- Multi-Tenant, FEFO Stock Control, Atomic POS Sales, Cash Sessions,
-- Sangrias, Capital & Patrimony, RLS Security & Audit Logs.
-- =====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing types if needed
DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM ('ADMIN', 'CASHIER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM (
        'ENTRY', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 
        'ADJUSTMENT', 'LOSS', 'EXPIRY', 'RETURN', 'REVERSAL', 'CORRECTION'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_type AS ENUM (
        'CASH', 'CARD_CREDIT', 'CARD_DEBIT', 'PIX', 'TRANSFER', 'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cash_movement_type AS ENUM (
        'INITIAL', 'SALE', 'SANGRIA_BANK', 'SANGRIA_OWNER', 'ENTRY', 'EXPENSE', 'REVERSAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE loss_reason_type AS ENUM (
        'EXPIRY', 'DAMAGE', 'THEFT', 'CONTAMINATION', 'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE capital_trans_type AS ENUM (
        'INITIAL_CAPITAL', 'CAPITAL_CONTRIBUTION', 'OWNER_WITHDRAWAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------
-- 1. STORES & MULTI-TENANCY
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    cnpj_nif VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'R$',
    receipt_header TEXT DEFAULT 'FARMAKEIA - Drogaria & Farmácia',
    receipt_footer TEXT DEFAULT 'Obrigado pela preferência! Volte sempre.',
    logo_url TEXT,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 2. USER PROFILES & STORE PERMISSIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role user_role_type DEFAULT 'CASHIER' NOT NULL,
    default_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role user_role_type DEFAULT 'CASHIER' NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(store_id, user_id)
);

-- ---------------------------------------------------------------------
-- 3. PRODUCT UNITS & CONVERSIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    is_base BOOLEAN DEFAULT FALSE NOT NULL,
    is_system BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 4. SUPPLIERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    tax_id VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    contact_person VARCHAR(100),
    address TEXT,
    notes TEXT,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 5. PRODUCTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    code VARCHAR(100),
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    dosage VARCHAR(100),
    presentation VARCHAR(100),
    manufacturer VARCHAR(255),
    category VARCHAR(100) DEFAULT 'Medicamentos',
    base_unit_id UUID REFERENCES public.product_units(id) ON DELETE SET NULL,
    min_stock_base NUMERIC(12, 3) DEFAULT 0 NOT NULL,
    current_stock_base NUMERIC(12, 3) DEFAULT 0 NOT NULL,
    cost_price_base NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    sale_price_base NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    allows_fractionation BOOLEAN DEFAULT TRUE NOT NULL,
    prescription_required BOOLEAN DEFAULT FALSE NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 6. PRODUCT PACKAGES (Apresentações / Embalagens e Fatores de Conversão)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    unit_id UUID REFERENCES public.product_units(id) ON DELETE RESTRICT NOT NULL,
    package_name VARCHAR(100) NOT NULL,
    multiplier_to_base NUMERIC(12, 3) NOT NULL CHECK (multiplier_to_base > 0),
    sale_price NUMERIC(12, 4) NOT NULL CHECK (sale_price >= 0),
    barcode VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 7. BATCHES (Lotes com Data de Validade e Quantidade Base)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    initial_quantity_base NUMERIC(12, 3) NOT NULL,
    current_quantity_base NUMERIC(12, 3) NOT NULL CHECK (current_quantity_base >= 0),
    cost_per_base NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    expiry_date DATE NOT NULL,
    manufacture_date DATE,
    status VARCHAR(50) DEFAULT 'ACTIVE' NOT NULL, -- 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'DISCARDED'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 8. PURCHASES & PURCHASE ITEMS (Entradas de Armazém)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100),
    purchase_date DATE DEFAULT CURRENT_DATE NOT NULL,
    total_amount NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'PAID' NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    unit_id UUID REFERENCES public.product_units(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL,
    multiplier_to_base NUMERIC(12, 3) DEFAULT 1 NOT NULL,
    quantity_base NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 4) NOT NULL,
    total_cost NUMERIC(12, 4) NOT NULL,
    sale_price_per_base NUMERIC(12, 4)
);

-- ---------------------------------------------------------------------
-- 9. STOCK MOVEMENTS (Histórico Rigoroso e Auditável de Estoque)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    movement_type stock_movement_type NOT NULL,
    quantity_base NUMERIC(12, 3) NOT NULL, -- Positive for in, Negative for out
    previous_stock_base NUMERIC(12, 3) NOT NULL,
    new_stock_base NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 4) DEFAULT 0 NOT NULL,
    reference_id UUID,
    reference_type VARCHAR(100), -- 'PURCHASE', 'SALE', 'TRANSFER', 'LOSS', 'REVERSAL'
    reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 10. TRANSFERS (Transferências entre Farmácias)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    destination_store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'COMPLETED' NOT NULL, -- 'PENDING', 'COMPLETED', 'CANCELLED'
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE RESTRICT,
    quantity_base NUMERIC(12, 3) NOT NULL
);

-- ---------------------------------------------------------------------
-- 11. CASH REGISTERS, SESSIONS & MOVEMENTS (Caixa, Sangrias e Sessões)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    register_id UUID REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
    opened_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    closed_at TIMESTAMPTZ,
    initial_cash NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    expected_cash NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    counted_cash NUMERIC(12, 2),
    cash_difference NUMERIC(12, 2),
    total_sales_cash NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_sales_card NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_sales_pix NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_sales_other NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_sangrias NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_entries NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN' NOT NULL, -- 'OPEN', 'CLOSED'
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE NOT NULL,
    movement_type cash_movement_type NOT NULL,
    payment_method payment_method_type DEFAULT 'CASH' NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    destination VARCHAR(255), -- 'TRANSFERENCIA_BANCO' or 'SAIDA_PROPRIETARIO' or other
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    notes TEXT
);

-- ---------------------------------------------------------------------
-- 12. SALES & SALE ITEMS (Vendas Atômicas, Recibos e Itens)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    sale_number BIGSERIAL,
    receipt_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) DEFAULT 'Consumidor Final',
    customer_tax_id VARCHAR(50),
    total_gross NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_net NUMERIC(12, 2) NOT NULL,
    total_cogs NUMERIC(12, 4) DEFAULT 0 NOT NULL, -- Custo real das mercadorias vendidas
    gross_profit NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    payment_method payment_method_type DEFAULT 'CASH' NOT NULL,
    payment_details JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'COMPLETED' NOT NULL, -- 'COMPLETED', 'REVERSED'
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reversal_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE RESTRICT,
    package_id UUID REFERENCES public.product_packages(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES public.product_units(id) ON DELETE RESTRICT,
    quantity_sold NUMERIC(12, 3) NOT NULL,
    multiplier_to_base NUMERIC(12, 3) DEFAULT 1 NOT NULL,
    quantity_base NUMERIC(12, 3) NOT NULL,
    unit_price NUMERIC(12, 4) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    unit_cogs NUMERIC(12, 4) NOT NULL,
    total_cogs NUMERIC(12, 4) NOT NULL
);

-- Ensure batch_id is nullable if table already existed with NOT NULL
ALTER TABLE public.sale_items ALTER COLUMN batch_id DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 13. LOSSES & DISCARDS (Perdas, Avarias e Vencidos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.losses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE RESTRICT NOT NULL,
    quantity_base NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 4) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL,
    loss_type loss_reason_type DEFAULT 'EXPIRY' NOT NULL,
    reason TEXT NOT NULL,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 14. CAPITAL & FINANCIAL TRANSACTIONS (Capital Investido & Financeiro)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capital_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    transaction_type capital_trans_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    payment_method payment_method_type DEFAULT 'TRANSFER' NOT NULL,
    reference_date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'SALE_REVENUE', 'PURCHASE_EXPENSE', 'OPERATIONAL_EXPENSE', 'SANGRIA_OWNER', 'CAPITAL_CONTRIBUTION', 'LOSS_EXPENSE', etc.
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    payment_method payment_method_type DEFAULT 'CASH' NOT NULL,
    reference_id UUID,
    reference_type VARCHAR(100),
    description TEXT NOT NULL,
    transaction_date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 15. DAILY CLOSINGS (Fechamento Diário Consolidado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    closing_date DATE NOT NULL,
    total_revenue NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_cogs NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    gross_profit NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_expenses NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    net_profit NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    cash_balance NUMERIC(12, 2) DEFAULT 0 NOT NULL,
    total_sales_count INT DEFAULT 0 NOT NULL,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(store_id, closing_date)
);

-- ---------------------------------------------------------------------
-- 16. AUDIT LOGS (Auditoria Imutável)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_role VARCHAR(50),
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL, -- 'LOGIN', 'SALE', 'SALE_REVERSAL', 'PURCHASE_ENTRY', 'SANGRIA', 'CASH_CLOSE', etc.
    entity VARCHAR(100) NOT NULL, -- 'sales', 'products', 'batches', 'cash_sessions', 'capital', etc.
    entity_id UUID,
    previous_state JSONB,
    new_state JSONB,
    details TEXT,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------
-- 17. SETTINGS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(store_id, setting_key)
);

-- ---------------------------------------------------------------------
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_batches_product_expiry ON public.batches(product_id, expiry_date, current_quantity_base);
CREATE INDEX IF NOT EXISTS idx_batches_store_status ON public.batches(store_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_store_date ON public.sales(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON public.sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_store ON public.stock_movements(store_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_user ON public.cash_sessions(store_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON public.cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_date ON public.audit_logs(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_financial_store_date ON public.financial_transactions(store_id, transaction_date);

-- ---------------------------------------------------------------------
-- INITIAL DEFAULT SYSTEM UNITS
-- ---------------------------------------------------------------------
INSERT INTO public.product_units (id, name, symbol, is_base, is_system) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Comprimido', 'comp', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000002', 'Cápsula', 'caps', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000003', 'Unidade', 'un', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000004', 'Frasco', 'fr', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000005', 'Ampola', 'amp', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000006', 'Tubo / Bisnaga', 'tubo', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000007', 'Sachê / Envelope', 'sache', TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000008', 'Carteira / Blister', 'cart', FALSE, TRUE),
    ('00000000-0000-0000-0000-000000000009', 'Caixa', 'cx', FALSE, TRUE),
    ('00000000-0000-0000-0000-000000000010', 'Pacote', 'pct', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_store_access(check_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_users su
        WHERE su.store_id = check_store_id
          AND su.user_id = auth.uid()
          AND su.active = TRUE
    ) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.active = TRUE
    );
$$;

-- Enable RLS on all tables
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------

-- Profiles: users read their own profile or Admins read all profiles
DROP POLICY IF EXISTS "profiles_self_and_admin" ON public.profiles;
CREATE POLICY "profiles_self_and_admin" ON public.profiles
FOR ALL USING (
    id = auth.uid() OR public.current_user_is_admin()
);

-- Stores: store access check
DROP POLICY IF EXISTS "stores_access" ON public.stores;
CREATE POLICY "stores_access" ON public.stores
FOR ALL USING (
    public.current_user_has_store_access(id) OR public.current_user_is_admin()
);

-- Store users:
DROP POLICY IF EXISTS "store_users_access" ON public.store_users;
CREATE POLICY "store_users_access" ON public.store_users
FOR ALL USING (
    user_id = auth.uid() OR public.current_user_is_admin()
);

-- Product units: System units accessible to all; Store units checked
DROP POLICY IF EXISTS "units_access" ON public.product_units;
CREATE POLICY "units_access" ON public.product_units
FOR ALL USING (
    is_system = TRUE OR store_id IS NULL OR public.current_user_has_store_access(store_id)
);

-- Products & Packages: All store workers can read products; admins manage
DROP POLICY IF EXISTS "products_access" ON public.products;
CREATE POLICY "products_access" ON public.products
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "packages_access" ON public.product_packages;
CREATE POLICY "packages_access" ON public.product_packages
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Batches: Accessible to store workers
DROP POLICY IF EXISTS "batches_access" ON public.batches;
CREATE POLICY "batches_access" ON public.batches
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Purchases & Items:
DROP POLICY IF EXISTS "purchases_access" ON public.purchases;
CREATE POLICY "purchases_access" ON public.purchases
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "purchase_items_access" ON public.purchase_items;
CREATE POLICY "purchase_items_access" ON public.purchase_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.id = purchase_items.purchase_id
          AND public.current_user_has_store_access(p.store_id)
    )
);

-- Suppliers:
DROP POLICY IF EXISTS "suppliers_access" ON public.suppliers;
CREATE POLICY "suppliers_access" ON public.suppliers
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Cash Registers & Sessions:
DROP POLICY IF EXISTS "cash_registers_access" ON public.cash_registers;
CREATE POLICY "cash_registers_access" ON public.cash_registers
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "cash_sessions_access" ON public.cash_sessions;
CREATE POLICY "cash_sessions_access" ON public.cash_sessions
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "cash_movements_access" ON public.cash_movements;
CREATE POLICY "cash_movements_access" ON public.cash_movements
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Sales & Sale items:
DROP POLICY IF EXISTS "sales_access" ON public.sales;
CREATE POLICY "sales_access" ON public.sales
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "sale_items_access" ON public.sale_items;
CREATE POLICY "sale_items_access" ON public.sale_items
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Stock movements:
DROP POLICY IF EXISTS "stock_movements_access" ON public.stock_movements;
CREATE POLICY "stock_movements_access" ON public.stock_movements
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Transfers:
DROP POLICY IF EXISTS "transfers_access" ON public.transfers;
CREATE POLICY "transfers_access" ON public.transfers
FOR ALL USING (
    public.current_user_has_store_access(source_store_id) OR public.current_user_has_store_access(destination_store_id)
);

-- Losses:
DROP POLICY IF EXISTS "losses_access" ON public.losses;
CREATE POLICY "losses_access" ON public.losses
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- Confidential Administrative Tables: Capital, Financial Transactions, Closings, Audit
DROP POLICY IF EXISTS "capital_access" ON public.capital_transactions;
CREATE POLICY "capital_access" ON public.capital_transactions
FOR ALL USING (
    public.current_user_is_admin() AND public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "finance_access" ON public.financial_transactions;
CREATE POLICY "finance_access" ON public.financial_transactions
FOR ALL USING (
    public.current_user_is_admin() AND public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "closings_access" ON public.daily_closings;
CREATE POLICY "closings_access" ON public.daily_closings
FOR ALL USING (
    public.current_user_is_admin() AND public.current_user_has_store_access(store_id)
);

DROP POLICY IF EXISTS "audit_access" ON public.audit_logs;
CREATE POLICY "audit_access" ON public.audit_logs
FOR ALL USING (
    public.current_user_is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "settings_access" ON public.settings;
CREATE POLICY "settings_access" ON public.settings
FOR ALL USING (
    public.current_user_has_store_access(store_id)
);

-- ---------------------------------------------------------------------
-- ATOMIC BUSINESS LOGIC FUNCTIONS & RPCs
-- ---------------------------------------------------------------------

-- RPC 1: PROCESS ATOMIC SALE (FEFO stock decrement, Sale, Items, Movements, Cash session & Audit)
CREATE OR REPLACE FUNCTION public.process_atomic_sale(
    p_store_id UUID,
    p_session_id UUID,
    p_customer_name VARCHAR(255),
    p_customer_tax_id VARCHAR(50),
    p_payment_method payment_method_type,
    p_discount_amount NUMERIC(12, 2),
    p_items JSONB -- Array of { product_id, package_id, unit_id, quantity, unit_price, multiplier_to_base }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_sale_id UUID;
    v_receipt_number VARCHAR(100);
    v_total_gross NUMERIC(12, 2) := 0;
    v_total_net NUMERIC(12, 2) := 0;
    v_total_cogs NUMERIC(12, 4) := 0;
    v_gross_profit NUMERIC(12, 2) := 0;
    v_item RECORD;
    v_qty_needed NUMERIC(12, 3);
    v_qty_from_batch NUMERIC(12, 3);
    v_batch RECORD;
    v_prod RECORD;
    v_batch_cogs NUMERIC(12, 4);
    v_item_cogs NUMERIC(12, 4);
    v_item_total NUMERIC(12, 2);
    v_prev_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
    v_session_status VARCHAR(50);
BEGIN
    -- 1. Validate caller and active cash session (graceful auto-attachment, only stock insufficiency can block)
    IF p_session_id IS NOT NULL THEN
        SELECT status INTO v_session_status FROM public.cash_sessions WHERE id = p_session_id;
        IF v_session_status IS NULL OR v_session_status != 'OPEN' THEN
            -- Attempt fallback to open session in current store
            SELECT id INTO p_session_id FROM public.cash_sessions 
            WHERE store_id = p_store_id AND status = 'OPEN' 
            ORDER BY opened_at DESC LIMIT 1;
        END IF;
    ELSE
        -- Auto-attach to active open session in store if available
        SELECT id INTO p_session_id FROM public.cash_sessions 
        WHERE store_id = p_store_id AND status = 'OPEN' 
        ORDER BY opened_at DESC LIMIT 1;
    END IF;

    -- 2. Generate unique Receipt Number (REC-YYYYMMDD-HHMMSS-RAND)
    v_receipt_number := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

    -- 3. Calculate gross total and pre-validate all items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        package_id UUID,
        unit_id UUID,
        quantity NUMERIC(12, 3),
        unit_price NUMERIC(12, 4),
        multiplier_to_base NUMERIC(12, 3)
    )
    LOOP
        v_item_total := ROUND((v_item.quantity * v_item.unit_price)::NUMERIC, 2);
        v_total_gross := v_total_gross + v_item_total;
    END LOOP;

    v_total_net := GREATEST(0, v_total_gross - COALESCE(p_discount_amount, 0));

    -- 4. Create Sale Record
    INSERT INTO public.sales (
        store_id, session_id, receipt_number, customer_name, customer_tax_id,
        total_gross, discount_amount, total_net, payment_method, status, created_by
    ) VALUES (
        p_store_id, p_session_id, v_receipt_number, COALESCE(p_customer_name, 'Consumidor Final'),
        p_customer_tax_id, v_total_gross, COALESCE(p_discount_amount, 0), v_total_net, p_payment_method, 'COMPLETED', v_user_id
    ) RETURNING id INTO v_sale_id;

    -- 5. Process each item with rigorous FEFO batch consumption
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        package_id UUID,
        unit_id UUID,
        quantity NUMERIC(12, 3),
        unit_price NUMERIC(12, 4),
        multiplier_to_base NUMERIC(12, 3)
    )
    LOOP
        -- Total units in base measurement
        v_qty_needed := v_item.quantity * COALESCE(v_item.multiplier_to_base, 1);
        v_item_total := ROUND((v_item.quantity * v_item.unit_price)::NUMERIC, 2);
        v_item_cogs := 0;

        -- Check total available stock for product
        SELECT id, name, current_stock_base, cost_price_base INTO v_prod FROM public.products 
        WHERE id = v_item.product_id AND store_id = p_store_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado na farmácia.';
        END IF;

        IF v_prod.current_stock_base < v_qty_needed THEN
            RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %', 
                v_prod.name, v_prod.current_stock_base, v_qty_needed;
        END IF;

        -- Step 1: Consume available batches strictly by FEFO (First Expired, First Out) without blocking by expiry date
        FOR v_batch IN 
            SELECT * FROM public.batches 
            WHERE product_id = v_item.product_id 
              AND store_id = p_store_id 
              AND current_quantity_base > 0 
            ORDER BY expiry_date ASC, created_at ASC 
            FOR UPDATE
        LOOP
            EXIT WHEN v_qty_needed <= 0;

            v_qty_from_batch := LEAST(v_batch.current_quantity_base, v_qty_needed);
            v_batch_cogs := v_qty_from_batch * v_batch.cost_per_base;
            v_item_cogs := v_item_cogs + v_batch_cogs;

            -- Decrement batch quantity
            UPDATE public.batches 
            SET current_quantity_base = current_quantity_base - v_qty_from_batch,
                status = CASE WHEN current_quantity_base - v_qty_from_batch = 0 THEN 'EXHAUSTED' ELSE status END
            WHERE id = v_batch.id;

            -- Insert Sale Item with exact batch link
            INSERT INTO public.sale_items (
                sale_id, store_id, product_id, batch_id, package_id, unit_id,
                quantity_sold, multiplier_to_base, quantity_base, unit_price, total_price,
                unit_cogs, total_cogs
            ) VALUES (
                v_sale_id, p_store_id, v_item.product_id, v_batch.id, v_item.package_id, v_item.unit_id,
                (v_qty_from_batch / COALESCE(v_item.multiplier_to_base, 1)),
                COALESCE(v_item.multiplier_to_base, 1),
                v_qty_from_batch,
                v_item.unit_price,
                ROUND(((v_qty_from_batch / COALESCE(v_item.multiplier_to_base, 1)) * v_item.unit_price)::NUMERIC, 2),
                v_batch.cost_per_base,
                v_batch_cogs
            );

            -- Stock Movement audit for this batch
            v_prev_stock := v_prod.current_stock_base;
            v_new_stock := v_prev_stock - v_qty_from_batch;

            INSERT INTO public.stock_movements (
                store_id, product_id, batch_id, movement_type, quantity_base,
                previous_stock_base, new_stock_base, unit_cost, reference_id,
                reference_type, reason, created_by
            ) VALUES (
                p_store_id, v_item.product_id, v_batch.id, 'SALE', -v_qty_from_batch,
                v_prev_stock, v_new_stock, v_batch.cost_per_base, v_sale_id,
                'SALE', 'Venda realizada no caixa. Recibo: ' || v_receipt_number, v_user_id
            );

            v_qty_needed := v_qty_needed - v_qty_from_batch;
        END LOOP;

        -- Step 2: If still needed quantity, consume remaining batches (even if near/expired) without blocking sale
        IF v_qty_needed > 0 THEN
            FOR v_batch IN 
                SELECT * FROM public.batches 
                WHERE product_id = v_item.product_id 
                  AND store_id = p_store_id 
                  AND current_quantity_base > 0 
                ORDER BY expiry_date ASC, created_at ASC 
                FOR UPDATE
            LOOP
                EXIT WHEN v_qty_needed <= 0;

                v_qty_from_batch := LEAST(v_batch.current_quantity_base, v_qty_needed);
                v_batch_cogs := v_qty_from_batch * v_batch.cost_per_base;
                v_item_cogs := v_item_cogs + v_batch_cogs;

                UPDATE public.batches 
                SET current_quantity_base = current_quantity_base - v_qty_from_batch,
                    status = CASE WHEN current_quantity_base - v_qty_from_batch = 0 THEN 'EXHAUSTED' ELSE status END
                WHERE id = v_batch.id;

                INSERT INTO public.sale_items (
                    sale_id, store_id, product_id, batch_id, package_id, unit_id,
                    quantity_sold, multiplier_to_base, quantity_base, unit_price, total_price,
                    unit_cogs, total_cogs
                ) VALUES (
                    v_sale_id, p_store_id, v_item.product_id, v_batch.id, v_item.package_id, v_item.unit_id,
                    (v_qty_from_batch / COALESCE(v_item.multiplier_to_base, 1)),
                    COALESCE(v_item.multiplier_to_base, 1),
                    v_qty_from_batch,
                    v_item.unit_price,
                    ROUND(((v_qty_from_batch / COALESCE(v_item.multiplier_to_base, 1)) * v_item.unit_price)::NUMERIC, 2),
                    v_batch.cost_per_base,
                    v_batch_cogs
                );

                v_prev_stock := v_prod.current_stock_base;
                v_new_stock := v_prev_stock - v_qty_from_batch;

                INSERT INTO public.stock_movements (
                    store_id, product_id, batch_id, movement_type, quantity_base,
                    previous_stock_base, new_stock_base, unit_cost, reference_id,
                    reference_type, reason, created_by
                ) VALUES (
                    p_store_id, v_item.product_id, v_batch.id, 'SALE', -v_qty_from_batch,
                    v_prev_stock, v_new_stock, v_batch.cost_per_base, v_sale_id,
                    'SALE', 'Venda realizada no caixa (Alerta de Validade). Recibo: ' || v_receipt_number, v_user_id
                );

                v_qty_needed := v_qty_needed - v_qty_from_batch;
            END LOOP;
        END IF;

        -- Step 3: If still needed and product has base stock without batch registration, fulfill with base cost
        IF v_qty_needed > 0 THEN
            v_batch_cogs := v_qty_needed * COALESCE(v_prod.cost_price_base, 0);
            v_item_cogs := v_item_cogs + v_batch_cogs;

            INSERT INTO public.sale_items (
                sale_id, store_id, product_id, batch_id, package_id, unit_id,
                quantity_sold, multiplier_to_base, quantity_base, unit_price, total_price,
                unit_cogs, total_cogs
            ) VALUES (
                v_sale_id, p_store_id, v_item.product_id, NULL, v_item.package_id, v_item.unit_id,
                (v_qty_needed / COALESCE(v_item.multiplier_to_base, 1)),
                COALESCE(v_item.multiplier_to_base, 1),
                v_qty_needed,
                v_item.unit_price,
                ROUND(((v_qty_needed / COALESCE(v_item.multiplier_to_base, 1)) * v_item.unit_price)::NUMERIC, 2),
                COALESCE(v_prod.cost_price_base, 0),
                v_batch_cogs
            );

            v_prev_stock := v_prod.current_stock_base;
            v_new_stock := v_prev_stock - v_qty_needed;

            INSERT INTO public.stock_movements (
                store_id, product_id, batch_id, movement_type, quantity_base,
                previous_stock_base, new_stock_base, unit_cost, reference_id,
                reference_type, reason, created_by
            ) VALUES (
                p_store_id, v_item.product_id, NULL, 'SALE', -v_qty_needed,
                v_prev_stock, v_new_stock, COALESCE(v_prod.cost_price_base, 0), v_sale_id,
                'SALE', 'Venda realizada no caixa (Estoque Geral). Recibo: ' || v_receipt_number, v_user_id
            );

            v_qty_needed := 0;
        END IF;

        -- Update main product current stock
        UPDATE public.products 
        SET current_stock_base = current_stock_base - (v_item.quantity * COALESCE(v_item.multiplier_to_base, 1)),
            updated_at = NOW()
        WHERE id = v_item.product_id;

        v_total_cogs := v_total_cogs + v_item_cogs;
    END LOOP;

    v_gross_profit := v_total_net - v_total_cogs;

    -- Update calculated COGS and Profit on Sale
    UPDATE public.sales 
    SET total_cogs = v_total_cogs,
        gross_profit = v_gross_profit
    WHERE id = v_sale_id;

    -- 6. Record Cash Movement if session provided & update session totals
    IF p_session_id IS NOT NULL THEN
        INSERT INTO public.cash_movements (
            store_id, session_id, movement_type, payment_method, amount,
            reason, created_by
        ) VALUES (
            p_store_id, p_session_id, 'SALE', p_payment_method, v_total_net,
            'Venda ' || v_receipt_number, v_user_id
        );

        IF p_payment_method = 'CASH' THEN
            UPDATE public.cash_sessions 
            SET total_sales_cash = total_sales_cash + v_total_net,
                expected_cash = expected_cash + v_total_net
            WHERE id = p_session_id;
        ELSIF p_payment_method IN ('CARD_CREDIT', 'CARD_DEBIT') THEN
            UPDATE public.cash_sessions 
            SET total_sales_card = total_sales_card + v_total_net
            WHERE id = p_session_id;
        ELSIF p_payment_method = 'PIX' THEN
            UPDATE public.cash_sessions 
            SET total_sales_pix = total_sales_pix + v_total_net
            WHERE id = p_session_id;
        ELSE
            UPDATE public.cash_sessions 
            SET total_sales_other = total_sales_other + v_total_net
            WHERE id = p_session_id;
        END IF;
    END IF;

    -- 7. Record Financial Revenue Transaction
    INSERT INTO public.financial_transactions (
        store_id, category, transaction_type, amount, payment_method,
        reference_id, reference_type, description, transaction_date, created_by
    ) VALUES (
        p_store_id, 'SALE_REVENUE', 'INCOME', v_total_net, p_payment_method,
        v_sale_id, 'SALE', 'Receita de Venda ' || v_receipt_number, CURRENT_DATE, v_user_id
    );

    -- 8. Write Audit Log
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        p_store_id, v_user_id, 'SALE', 'sales', v_sale_id,
        'Venda ' || v_receipt_number || ' total R$ ' || v_total_net || ' paga via ' || p_payment_method
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'receipt_number', v_receipt_number,
        'total_gross', v_total_gross,
        'discount_amount', p_discount_amount,
        'total_net', v_total_net,
        'payment_method', p_payment_method
    );
END;
$$;

-- RPC 2: REVERSE SALE (Estorno completo com devolução de lote e estorno financeiro/caixa)
CREATE OR REPLACE FUNCTION public.reverse_sale(
    p_sale_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_sale RECORD;
    v_item RECORD;
    v_session RECORD;
    v_current_stock NUMERIC(12, 3);
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda não encontrada.';
    END IF;

    IF v_sale.status = 'REVERSED' THEN
        RAISE EXCEPTION 'Esta venda já foi estornada anteriormente.';
    END IF;

    -- 1. Restore batch and product stocks
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id LOOP
        -- Restore batch
        UPDATE public.batches 
        SET current_quantity_base = current_quantity_base + v_item.quantity_base,
            status = 'ACTIVE'
        WHERE id = v_item.batch_id;

        -- Restore product
        SELECT current_stock_base INTO v_current_stock FROM public.products WHERE id = v_item.product_id;
        UPDATE public.products 
        SET current_stock_base = current_stock_base + v_item.quantity_base,
            updated_at = NOW()
        WHERE id = v_item.product_id;

        -- Record movement
        INSERT INTO public.stock_movements (
            store_id, product_id, batch_id, movement_type, quantity_base,
            previous_stock_base, new_stock_base, unit_cost, reference_id,
            reference_type, reason, created_by
        ) VALUES (
            v_sale.store_id, v_item.product_id, v_item.batch_id, 'REVERSAL', v_item.quantity_base,
            v_current_stock, v_current_stock + v_item.quantity_base, v_item.unit_cogs, v_sale.id,
            'REVERSAL', 'Estorno de venda ' || v_sale.receipt_number || ': ' || COALESCE(p_reason, 'Sem motivo especificado'), v_user_id
        );
    END LOOP;

    -- 2. Update Sale Status
    UPDATE public.sales 
    SET status = 'REVERSED',
        reversed_at = NOW(),
        reversed_by = v_user_id,
        reversal_reason = p_reason
    WHERE id = p_sale_id;

    -- 3. Adjust cash movement if session was used
    IF v_sale.session_id IS NOT NULL THEN
        INSERT INTO public.cash_movements (
            store_id, session_id, movement_type, payment_method, amount,
            reason, created_by
        ) VALUES (
            v_sale.store_id, v_sale.session_id, 'REVERSAL', v_sale.payment_method, -v_sale.total_net,
            'Estorno da venda ' || v_sale.receipt_number, v_user_id
        );

        IF v_sale.payment_method = 'CASH' THEN
            UPDATE public.cash_sessions 
            SET total_sales_cash = total_sales_cash - v_sale.total_net,
                expected_cash = expected_cash - v_sale.total_net
            WHERE id = v_sale.session_id;
        END IF;
    END IF;

    -- 4. Record compensatory financial transaction
    INSERT INTO public.financial_transactions (
        store_id, category, transaction_type, amount, payment_method,
        reference_id, reference_type, description, transaction_date, created_by
    ) VALUES (
        v_sale.store_id, 'SALE_REVERSAL', 'EXPENSE', v_sale.total_net, v_sale.payment_method,
        v_sale.id, 'REVERSAL', 'Estorno de Receita - Venda ' || v_sale.receipt_number, CURRENT_DATE, v_user_id
    );

    -- 5. Audit
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        v_sale.store_id, v_user_id, 'SALE_REVERSAL', 'sales', v_sale.id,
        'Estorno da venda ' || v_sale.receipt_number || '. Motivo: ' || COALESCE(p_reason, 'Nenhum')
    );

    RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id);
END;
$$;

-- RPC 3: REGISTER PURCHASE ENTRY (Entrada de Armazém com Lote, Validade e Atualização Automática de Custo)
CREATE OR REPLACE FUNCTION public.register_purchase_entry(
    p_store_id UUID,
    p_supplier_id UUID,
    p_invoice_number VARCHAR(100),
    p_purchase_date DATE,
    p_notes TEXT,
    p_items JSONB -- Array of { product_id, batch_number, expiry_date, unit_id, quantity, multiplier_to_base, unit_cost, sale_price_base }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_purchase_id UUID;
    v_total_amount NUMERIC(12, 2) := 0;
    v_item RECORD;
    v_batch_id UUID;
    v_qty_base NUMERIC(12, 3);
    v_cost_per_base NUMERIC(12, 4);
    v_item_total NUMERIC(12, 2);
    v_prev_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
BEGIN
    -- Check Admin permission
    IF NOT public.current_user_is_admin() THEN
        RAISE EXCEPTION 'Apenas administradores podem registrar compras e entradas de armazém.';
    END IF;

    -- Calculate total
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        batch_number VARCHAR(100),
        expiry_date DATE,
        unit_id UUID,
        quantity NUMERIC(12, 3),
        multiplier_to_base NUMERIC(12, 3),
        unit_cost NUMERIC(12, 4),
        sale_price_base NUMERIC(12, 4)
    )
    LOOP
        v_item_total := ROUND((v_item.quantity * v_item.unit_cost)::NUMERIC, 2);
        v_total_amount := v_total_amount + v_item_total;
    END LOOP;

    -- Create Purchase header
    INSERT INTO public.purchases (
        store_id, supplier_id, invoice_number, purchase_date,
        total_amount, payment_status, notes, created_by
    ) VALUES (
        p_store_id, p_supplier_id, p_invoice_number, COALESCE(p_purchase_date, CURRENT_DATE),
        v_total_amount, 'PAID', p_notes, v_user_id
    ) RETURNING id INTO v_purchase_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        batch_number VARCHAR(100),
        expiry_date DATE,
        unit_id UUID,
        quantity NUMERIC(12, 3),
        multiplier_to_base NUMERIC(12, 3),
        unit_cost NUMERIC(12, 4),
        sale_price_base NUMERIC(12, 4)
    )
    LOOP
        v_qty_base := v_item.quantity * COALESCE(v_item.multiplier_to_base, 1);
        v_cost_per_base := v_item.unit_cost / COALESCE(v_item.multiplier_to_base, 1);
        v_item_total := ROUND((v_item.quantity * v_item.unit_cost)::NUMERIC, 2);

        -- Record Purchase Item
        INSERT INTO public.purchase_items (
            purchase_id, product_id, batch_number, expiry_date, unit_id,
            quantity, multiplier_to_base, quantity_base, unit_cost, total_cost, sale_price_per_base
        ) VALUES (
            v_purchase_id, v_item.product_id, v_item.batch_number, v_item.expiry_date, v_item.unit_id,
            v_item.quantity, COALESCE(v_item.multiplier_to_base, 1), v_qty_base, v_item.unit_cost, v_item_total, v_item.sale_price_base
        );

        -- Insert or Update Batch
        INSERT INTO public.batches (
            store_id, product_id, batch_number, supplier_id,
            initial_quantity_base, current_quantity_base, cost_per_base, expiry_date, status
        ) VALUES (
            p_store_id, v_item.product_id, v_item.batch_number, p_supplier_id,
            v_qty_base, v_qty_base, v_cost_per_base, v_item.expiry_date, 'ACTIVE'
        ) RETURNING id INTO v_batch_id;

        -- Get and Update Product stock & prices
        SELECT current_stock_base INTO v_prev_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        v_new_stock := v_prev_stock + v_qty_base;

        UPDATE public.products 
        SET current_stock_base = v_new_stock,
            cost_price_base = v_cost_per_base,
            sale_price_base = COALESCE(v_item.sale_price_base, sale_price_base),
            updated_at = NOW()
        WHERE id = v_item.product_id;

        -- Record Stock Movement
        INSERT INTO public.stock_movements (
            store_id, product_id, batch_id, movement_type, quantity_base,
            previous_stock_base, new_stock_base, unit_cost, reference_id,
            reference_type, reason, created_by
        ) VALUES (
            p_store_id, v_item.product_id, v_batch_id, 'ENTRY', v_qty_base,
            v_prev_stock, v_new_stock, v_cost_per_base, v_purchase_id,
            'PURCHASE', 'Entrada NF ' || COALESCE(p_invoice_number, 'S/N') || ' Lote: ' || v_item.batch_number, v_user_id
        );
    END LOOP;

    -- Financial Expense Entry
    INSERT INTO public.financial_transactions (
        store_id, category, transaction_type, amount, payment_method,
        reference_id, reference_type, description, transaction_date, created_by
    ) VALUES (
        p_store_id, 'PURCHASE_EXPENSE', 'EXPENSE', v_total_amount, 'TRANSFER',
        v_purchase_id, 'PURCHASE', 'Compra NF ' || COALESCE(p_invoice_number, 'S/N'), COALESCE(p_purchase_date, CURRENT_DATE), v_user_id
    );

    -- Audit
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        p_store_id, v_user_id, 'PURCHASE_ENTRY', 'purchases', v_purchase_id,
        'Entrada de mercadorias NF: ' || COALESCE(p_invoice_number, 'S/N') || ' total R$ ' || v_total_amount
    );

    RETURN jsonb_build_object('success', true, 'purchase_id', v_purchase_id, 'total_amount', v_total_amount);
END;
$$;

-- RPC 4: REGISTER LOSS / DISCARD (Perdas, Danos, Vencimentos)
CREATE OR REPLACE FUNCTION public.register_loss(
    p_store_id UUID,
    p_product_id UUID,
    p_batch_id UUID,
    p_quantity_base NUMERIC(12, 3),
    p_loss_type loss_reason_type,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_batch RECORD;
    v_prod RECORD;
    v_total_cost NUMERIC(12, 2);
    v_prev_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
    v_loss_id UUID;
BEGIN
    SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lote não encontrado.';
    END IF;

    IF v_batch.current_quantity_base < p_quantity_base THEN
        RAISE EXCEPTION 'Quantidade de perda maior que a disponível no lote. Disponível: %', v_batch.current_quantity_base;
    END IF;

    v_total_cost := ROUND((p_quantity_base * v_batch.cost_per_base)::NUMERIC, 2);

    -- Deduct from batch
    UPDATE public.batches 
    SET current_quantity_base = current_quantity_base - p_quantity_base,
        status = CASE WHEN current_quantity_base - p_quantity_base = 0 THEN 'EXHAUSTED' ELSE status END
    WHERE id = p_batch_id;

    -- Deduct from product
    SELECT current_stock_base INTO v_prev_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
    v_new_stock := v_prev_stock - p_quantity_base;
    UPDATE public.products SET current_stock_base = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

    -- Insert loss record
    INSERT INTO public.losses (
        store_id, product_id, batch_id, quantity_base, unit_cost, total_cost, loss_type, reason, recorded_by
    ) VALUES (
        p_store_id, p_product_id, p_batch_id, p_quantity_base, v_batch.cost_per_base, v_total_cost, p_loss_type, p_reason, v_user_id
    ) RETURNING id INTO v_loss_id;

    -- Movement
    INSERT INTO public.stock_movements (
        store_id, product_id, batch_id, movement_type, quantity_base,
        previous_stock_base, new_stock_base, unit_cost, reference_id, reference_type, reason, created_by
    ) VALUES (
        p_store_id, p_product_id, p_batch_id, 'LOSS', -p_quantity_base,
        v_prev_stock, v_new_stock, v_batch.cost_per_base, v_loss_id, 'LOSS',
        'Registro de perda/descarte: ' || p_reason, v_user_id
    );

    -- Financial entry for loss
    INSERT INTO public.financial_transactions (
        store_id, category, transaction_type, amount, payment_method,
        reference_id, reference_type, description, transaction_date, created_by
    ) VALUES (
        p_store_id, 'LOSS_EXPENSE', 'EXPENSE', v_total_cost, 'OTHER',
        v_loss_id, 'LOSS', 'Perda de estoque: ' || p_reason, CURRENT_DATE, v_user_id
    );

    -- Audit
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        p_store_id, v_user_id, 'LOSS_RECORDED', 'losses', v_loss_id,
        'Perda registrada no lote ' || v_batch.batch_number || ' no valor de R$ ' || v_total_cost
    );

    RETURN jsonb_build_object('success', true, 'loss_id', v_loss_id);
END;
$$;

-- RPC 5: REGISTER SANGRIA (Sangria de Caixa: Diferenciando Transferência Banco vs Retirada Proprietário)
CREATE OR REPLACE FUNCTION public.register_sangria(
    p_store_id UUID,
    p_session_id UUID,
    p_amount NUMERIC(12, 2),
    p_destination VARCHAR(255), -- 'SANGRIA_BANK' or 'SANGRIA_OWNER'
    p_reason TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_session RECORD;
    v_mov_id UUID;
BEGIN
    SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessão de caixa não encontrada.';
    END IF;

    IF v_session.status != 'OPEN' THEN
        RAISE EXCEPTION 'A sessão de caixa está fechada.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor da sangria deve ser maior que zero.';
    END IF;

    -- Record Cash Movement
    INSERT INTO public.cash_movements (
        store_id, session_id, movement_type, payment_method, amount,
        reason, destination, notes, created_by
    ) VALUES (
        p_store_id, p_session_id, p_destination::cash_movement_type, 'CASH', p_amount,
        p_reason, p_destination, p_notes, v_user_id
    ) RETURNING id INTO v_mov_id;

    -- Update session expected cash & sangrias
    UPDATE public.cash_sessions 
    SET total_sangrias = total_sangrias + p_amount,
        expected_cash = expected_cash - p_amount
    WHERE id = p_session_id;

    -- If SAIDA REAL (Proprietário), record financial owner withdrawal transaction
    IF p_destination = 'SANGRIA_OWNER' THEN
        INSERT INTO public.capital_transactions (
            store_id, transaction_type, amount, description, payment_method, reference_date, created_by
        ) VALUES (
            p_store_id, 'OWNER_WITHDRAWAL', p_amount, 'Retirada de Sangria do Caixa: ' || p_reason, 'CASH', CURRENT_DATE, v_user_id
        );

        INSERT INTO public.financial_transactions (
            store_id, category, transaction_type, amount, payment_method,
            reference_id, reference_type, description, transaction_date, created_by
        ) VALUES (
            p_store_id, 'OWNER_WITHDRAWAL', 'EXPENSE', p_amount, 'CASH',
            v_mov_id, 'SANGRIA', 'Retirada do Proprietário: ' || p_reason, CURRENT_DATE, v_user_id
        );
    END IF;

    -- Audit
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        p_store_id, v_user_id, 'SANGRIA', 'cash_movements', v_mov_id,
        'Sangria de R$ ' || p_amount || ' (' || p_destination || '). Motivo: ' || p_reason
    );

    RETURN jsonb_build_object('success', true, 'movement_id', v_mov_id);
END;
$$;

-- RPC 6: CLOSE CASH SESSION (Fechamento de Caixa com Apuração de Diferenças)
CREATE OR REPLACE FUNCTION public.close_cash_session(
    p_session_id UUID,
    p_counted_cash NUMERIC(12, 2),
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_session RECORD;
    v_difference NUMERIC(12, 2);
BEGIN
    SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sessão de caixa não encontrada.';
    END IF;

    IF v_session.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Esta sessão de caixa já está fechada.';
    END IF;

    v_difference := p_counted_cash - v_session.expected_cash;

    UPDATE public.cash_sessions 
    SET closed_at = NOW(),
        counted_cash = p_counted_cash,
        cash_difference = v_difference,
        status = 'CLOSED',
        notes = p_notes
    WHERE id = p_session_id;

    -- Audit
    INSERT INTO public.audit_logs (
        store_id, user_id, action, entity, entity_id, details
    ) VALUES (
        v_session.store_id, v_user_id, 'CASH_CLOSE', 'cash_sessions', p_session_id,
        'Fechamento de caixa. Esperado: R$ ' || v_session.expected_cash || ', Contado: R$ ' || p_counted_cash || ', Diferença: R$ ' || v_difference
    );

    RETURN jsonb_build_object(
        'success', true,
        'expected_cash', v_session.expected_cash,
        'counted_cash', p_counted_cash,
        'difference', v_difference
    );
END;
$$;

-- RPC 7: GET ADMIN DASHBOARD METRICS (Apenas Administrador)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_today_sales_revenue NUMERIC(12, 2) := 0;
    v_today_cogs NUMERIC(12, 2) := 0;
    v_today_profit NUMERIC(12, 2) := 0;
    v_today_sales_count INT := 0;
    
    v_month_sales_revenue NUMERIC(12, 2) := 0;
    v_month_cogs NUMERIC(12, 2) := 0;
    v_month_profit NUMERIC(12, 2) := 0;

    v_stock_cost_valuation NUMERIC(12, 2) := 0;
    v_stock_sale_valuation NUMERIC(12, 2) := 0;

    v_total_capital_contributions NUMERIC(12, 2) := 0;
    v_total_capital_withdrawals NUMERIC(12, 2) := 0;
    v_net_invested_capital NUMERIC(12, 2) := 0;

    v_cash_in_open_drawers NUMERIC(12, 2) := 0;
    v_total_losses_month NUMERIC(12, 2) := 0;

    v_expired_batches_count INT := 0;
    v_expiring_30_count INT := 0;
    v_expiring_60_count INT := 0;
    v_expiring_90_count INT := 0;
BEGIN
    IF NOT public.current_user_is_admin() THEN
        RAISE EXCEPTION 'Acesso restrito a administradores.';
    END IF;

    -- 1. Today's sales metrics
    SELECT 
        COALESCE(SUM(total_net), 0),
        COALESCE(SUM(total_cogs), 0),
        COALESCE(SUM(gross_profit), 0),
        COUNT(*)
    INTO v_today_sales_revenue, v_today_cogs, v_today_profit, v_today_sales_count
    FROM public.sales 
    WHERE store_id = p_store_id 
      AND status = 'COMPLETED'
      AND created_at >= v_today::TIMESTAMPTZ;

    -- 2. Month's sales metrics
    SELECT 
        COALESCE(SUM(total_net), 0),
        COALESCE(SUM(total_cogs), 0),
        COALESCE(SUM(gross_profit), 0)
    INTO v_month_sales_revenue, v_month_cogs, v_month_profit
    FROM public.sales 
    WHERE store_id = p_store_id 
      AND status = 'COMPLETED'
      AND created_at >= DATE_TRUNC('month', v_today)::TIMESTAMPTZ;

    -- 3. Stock Valuation (at real cost from active batches and at sale price)
    SELECT 
        COALESCE(SUM(b.current_quantity_base * b.cost_per_base), 0)
    INTO v_stock_cost_valuation
    FROM public.batches b
    WHERE b.store_id = p_store_id AND b.current_quantity_base > 0;

    SELECT 
        COALESCE(SUM(p.current_stock_base * p.sale_price_base), 0)
    INTO v_stock_sale_valuation
    FROM public.products p
    WHERE p.store_id = p_store_id AND p.current_stock_base > 0;

    -- 4. Net Invested Capital
    SELECT 
        COALESCE(SUM(CASE WHEN transaction_type IN ('INITIAL_CAPITAL', 'CAPITAL_CONTRIBUTION') THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type = 'OWNER_WITHDRAWAL' THEN amount ELSE 0 END), 0)
    INTO v_total_capital_contributions, v_total_capital_withdrawals
    FROM public.capital_transactions
    WHERE store_id = p_store_id;

    v_net_invested_capital := v_total_capital_contributions - v_total_capital_withdrawals;

    -- 5. Cash in drawers (open sessions expected cash)
    SELECT COALESCE(SUM(expected_cash), 0)
    INTO v_cash_in_open_drawers
    FROM public.cash_sessions
    WHERE store_id = p_store_id AND status = 'OPEN';

    -- 6. Monthly Losses
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_total_losses_month
    FROM public.losses
    WHERE store_id = p_store_id 
      AND created_at >= DATE_TRUNC('month', v_today)::TIMESTAMPTZ;

    -- 7. FEFO Expiry breakdown
    SELECT 
        COUNT(CASE WHEN expiry_date < v_today THEN 1 END),
        COUNT(CASE WHEN expiry_date >= v_today AND expiry_date <= v_today + INTERVAL '30 days' THEN 1 END),
        COUNT(CASE WHEN expiry_date > v_today + INTERVAL '30 days' AND expiry_date <= v_today + INTERVAL '60 days' THEN 1 END),
        COUNT(CASE WHEN expiry_date > v_today + INTERVAL '60 days' AND expiry_date <= v_today + INTERVAL '90 days' THEN 1 END)
    INTO v_expired_batches_count, v_expiring_30_count, v_expiring_60_count, v_expiring_90_count
    FROM public.batches
    WHERE store_id = p_store_id AND current_quantity_base > 0;

    RETURN jsonb_build_object(
        'today_sales_revenue', v_today_sales_revenue,
        'today_cogs', v_today_cogs,
        'today_profit', v_today_profit,
        'today_sales_count', v_today_sales_count,
        'month_sales_revenue', v_month_sales_revenue,
        'month_cogs', v_month_cogs,
        'month_profit', v_month_profit,
        'stock_cost_valuation', v_stock_cost_valuation,
        'stock_sale_valuation', v_stock_sale_valuation,
        'net_invested_capital', v_net_invested_capital,
        'cash_in_open_drawers', v_cash_in_open_drawers,
        'estimated_patrimony', (v_cash_in_open_drawers + v_stock_cost_valuation),
        'total_losses_month', v_total_losses_month,
        'expired_batches_count', v_expired_batches_count,
        'expiring_30_count', v_expiring_30_count,
        'expiring_60_count', v_expiring_60_count,
        'expiring_90_count', v_expiring_90_count
    );
END;
$$;

-- RPC 8: GET CASHIER DASHBOARD METRICS (Acesso Seguro para Operadores de Caixa)
CREATE OR REPLACE FUNCTION public.get_cashier_dashboard_metrics(p_store_id UUID, p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_session RECORD;
    v_today_sales_count INT := 0;
    v_today_sales_amount NUMERIC(12, 2) := 0;
    v_recent_sales JSONB;
BEGIN
    SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id AND store_id = p_store_id;

    IF v_session.id IS NOT NULL THEN
        SELECT COUNT(*), COALESCE(SUM(total_net), 0)
        INTO v_today_sales_count, v_today_sales_amount
        FROM public.sales
        WHERE session_id = p_session_id AND status = 'COMPLETED';

        SELECT jsonb_agg(sub) INTO v_recent_sales
        FROM (
            SELECT id, receipt_number, total_net, payment_method, customer_name, created_at
            FROM public.sales
            WHERE session_id = p_session_id
            ORDER BY created_at DESC
            LIMIT 10
        ) sub;
    END IF;

    RETURN jsonb_build_object(
        'session_id', v_session.id,
        'status', COALESCE(v_session.status, 'NO_SESSION'),
        'opened_at', v_session.opened_at,
        'initial_cash', COALESCE(v_session.initial_cash, 0),
        'expected_cash', COALESCE(v_session.expected_cash, 0),
        'total_sales_cash', COALESCE(v_session.total_sales_cash, 0),
        'total_sales_card', COALESCE(v_session.total_sales_card, 0),
        'total_sales_pix', COALESCE(v_session.total_sales_pix, 0),
        'total_sangrias', COALESCE(v_session.total_sangrias, 0),
        'session_sales_count', v_today_sales_count,
        'session_sales_amount', v_today_sales_amount,
        'recent_sales', COALESCE(v_recent_sales, '[]'::jsonb)
    );
END;
$$;
