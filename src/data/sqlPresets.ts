import type { SqlLanguage } from 'sql-formatter';

export interface DialectOption {
  value: SqlLanguage;
  label: string;
}

export const SQL_DIALECTS: DialectOption[] = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'T-SQL (SQL Server)' },
  { value: 'bigquery', label: 'Google BigQuery' },
  { value: 'plsql', label: 'Oracle PL/SQL' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'redshift', label: 'Amazon Redshift' },
  { value: 'trino', label: 'Trino / Presto' },
  { value: 'spark', label: 'Spark SQL' },
];

export interface SqlPreset {
  id: string;
  title: string;
  dialect: SqlLanguage;
  description: string;
  query: string;
}

export const SQL_PRESETS: SqlPreset[] = [
  {
    id: 'analytics-cte',
    title: 'Аналітика продажів із CTE та віконними функціями',
    dialect: 'postgresql',
    description: 'Агрегація замовлень за категоріями, ранжування та обчислення накопичувального підсумку.',
    query: `with monthly_revenue as (select c.category_name, date_trunc('month', o.created_at) as order_month, sum(oi.quantity * oi.unit_price) as total_revenue, count(distinct o.order_id) as orders_count from orders o inner join order_items oi on o.order_id = oi.order_id inner join products p on oi.product_id = p.product_id inner join categories c on p.category_id = c.category_id where o.status in ('completed', 'shipped') and o.created_at >= '2025-01-01' group by 1, 2) select category_name, order_month, total_revenue, orders_count, rank() over (partition by order_month order by total_revenue desc) as monthly_rank, sum(total_revenue) over (partition by category_name order by order_month) as cumulative_revenue from monthly_revenue order by order_month desc, total_revenue desc limit 50;`,
  },
  {
    id: 'ecommerce-join',
    title: 'Вибірка клієнтів із фільтрацією та підзапитом',
    dialect: 'mysql',
    description: 'Запит для отримання активних покупців, їхнього середнього чеку та останньої дати покупки.',
    query: `select u.id, u.full_name, u.email, coalesce(stats.orders_total, 0) as orders_total, round(coalesce(stats.avg_check, 0), 2) as avg_check, stats.last_order_date from users u left join (select user_id, count(*) as orders_total, avg(total_amount) as avg_check, max(created_at) as last_order_date from orders where status <> 'cancelled' group by user_id) stats on stats.user_id = u.id where u.is_active = 1 and (u.country = 'UA' or u.country = 'PL') having orders_total >= 3 order by avg_check desc, last_order_date desc;`,
  },
  {
    id: 'ddl-schema',
    title: 'Створення таблиці транзакцій та індексів',
    dialect: 'postgresql',
    description: 'DDL-скрипт для створення таблиці платежів із зовнішніми ключами та обмеженнями цілісності.',
    query: `create table if not exists payment_transactions (transaction_id uuid primary key default gen_random_uuid(), account_id bigint not null references accounts(id) on delete cascade, amount numeric(14, 2) not null check (amount > 0), currency char(3) not null default 'UAH', status varchar(24) not null check (status in ('pending', 'authorized', 'settled', 'failed')), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()); create index idx_payments_account_created on payment_transactions (account_id, created_at desc);`,
  },
  {
    id: 'upsert-merge',
    title: 'Оновлення залишків товарів (Upsert)',
    dialect: 'postgresql',
    description: 'Пакетне вставлення нових позицій на складі з оновленням кількості при конфлікті.',
    query: `insert into warehouse_stock (sku, warehouse_code, available_qty, reserved_qty, updated_at) values ('SKU-1042', 'KYIV-01', 120, 8, now()), ('SKU-2089', 'LVIV-02', 45, 0, now()) on conflict (sku, warehouse_code) do update set available_qty = warehouse_stock.available_qty + excluded.available_qty, reserved_qty = excluded.reserved_qty, updated_at = now() returning sku, available_qty;`,
  },
];
