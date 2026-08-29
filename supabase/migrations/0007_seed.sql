-- 0007_seed
-- Reference data. Everything here is configuration, not business records: the
-- module registry, the four views and their navigation sets, roles, and the
-- default permission matrix.

insert into public.departments (name, sort_order) values
  ('Sales', 1),
  ('Accounting', 2),
  ('HR', 3),
  ('Warehouse & Logistic', 4);

insert into public.modules (key, name, icon, href, sort_order) values
  ('user',            'User',              'users',    'users',       1),
  ('customer',        'Customer',          'building', 'customers',   2),
  ('product',         'Product',           'box',      'products',    3),
  ('sale_order',      'Sales Order',       'cart',     'sale-orders', 4),
  ('invoice',         'Invoice',           'file',     'invoices',    5),
  ('payment',         'Payment',           'wallet',   'payments',    6),
  ('role_permission', 'Role & Permission', 'shield',   'roles',       7),
  ('audit_log',       'Audit Log',         'history',  'audit-log',   8),
  ('settings',        'Settings',          'settings', 'settings',    9);

insert into public.views (key, name, description, icon, sort_order) values
  ('admin',      'System Admin',         'Users, permissions and system records',   'shield',   1),
  ('sales',      'Sale',                 'Customers, orders and collections',       'cart',     2),
  ('accounting', 'Accountant',           'Invoicing, payments and receivables',     'file',     3),
  ('warehouse',  'Warehouse & Logistic', 'Stock, fulfilment and delivery',          'box',      4);

insert into public.view_modules (view_key, module_key, sort_order) values
  ('admin',      'user',            1),
  ('admin',      'role_permission', 2),
  ('admin',      'audit_log',       3),
  ('admin',      'settings',        4),

  ('sales',      'customer',        1),
  ('sales',      'sale_order',      2),
  ('sales',      'payment',         3),
  ('sales',      'product',         4),

  ('accounting', 'invoice',         1),
  ('accounting', 'payment',         2),
  ('accounting', 'customer',        3),
  ('accounting', 'sale_order',      4),

  ('warehouse',  'product',         1),
  ('warehouse',  'sale_order',      2),
  ('warehouse',  'settings',        3);

insert into public.roles (key, name, description, sort_order) values
  ('system_admin', 'System Admin',         'Full access to every module and view', 1),
  ('sales',        'Sales Team',           'Field sales and customer accounts',    2),
  ('accounting',   'Accounting',           'Invoicing, payments and receivables',  3),
  ('warehouse',    'Warehouse & Logistics','Stock and fulfilment',                 4),
  ('hr',           'HR',                   'Employee records and payroll data',    5);

-- Default views per role. System Admin can enter all four, which is what makes
-- the view selection screen reachable at all.
insert into public.role_views (role_id, view_key, sort_order)
select r.id, v.view_key, v.sort_order
from (values
  ('system_admin', 'admin',      1),
  ('system_admin', 'sales',      2),
  ('system_admin', 'accounting', 3),
  ('system_admin', 'warehouse',  4),
  ('sales',        'sales',      1),
  ('accounting',   'accounting', 1),
  ('warehouse',    'warehouse',  1),
  ('hr',           'admin',      1)
) as v(role_key, view_key, sort_order)
join public.roles r on r.key = v.role_key;

-- Default permission matrix.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, p.module_key, p.action::public.permission_action, p.scope::public.permission_scope
from (values
  -- System Admin: everything, everywhere.
  ('system_admin', 'user',            'view',   'any'),
  ('system_admin', 'user',            'add',    'any'),
  ('system_admin', 'user',            'edit',   'any'),
  ('system_admin', 'user',            'delete', 'any'),
  ('system_admin', 'customer',        'view',   'any'),
  ('system_admin', 'customer',        'add',    'any'),
  ('system_admin', 'customer',        'edit',   'any'),
  ('system_admin', 'customer',        'delete', 'any'),
  ('system_admin', 'product',         'view',   'any'),
  ('system_admin', 'product',         'add',    'any'),
  ('system_admin', 'product',         'edit',   'any'),
  ('system_admin', 'product',         'delete', 'any'),
  ('system_admin', 'sale_order',      'view',   'any'),
  ('system_admin', 'sale_order',      'add',    'any'),
  ('system_admin', 'sale_order',      'edit',   'any'),
  ('system_admin', 'sale_order',      'delete', 'any'),
  ('system_admin', 'invoice',         'view',   'any'),
  ('system_admin', 'invoice',         'add',    'any'),
  ('system_admin', 'invoice',         'edit',   'any'),
  ('system_admin', 'invoice',         'delete', 'any'),
  ('system_admin', 'payment',         'view',   'any'),
  ('system_admin', 'payment',         'add',    'any'),
  ('system_admin', 'payment',         'edit',   'any'),
  ('system_admin', 'payment',         'delete', 'any'),
  ('system_admin', 'role_permission', 'view',   'any'),
  ('system_admin', 'role_permission', 'add',    'any'),
  ('system_admin', 'role_permission', 'edit',   'any'),
  ('system_admin', 'role_permission', 'delete', 'any'),
  ('system_admin', 'audit_log',       'view',   'any'),
  ('system_admin', 'settings',        'view',   'any'),
  ('system_admin', 'settings',        'edit',   'any'),

  -- Sales Team: own and subordinate data, product catalogue read-only.
  ('sales', 'customer',   'view', 'any'),
  ('sales', 'customer',   'add',  'own'),
  ('sales', 'customer',   'edit', 'own'),
  ('sales', 'sale_order', 'view', 'sub'),
  ('sales', 'sale_order', 'add',  'own'),
  ('sales', 'sale_order', 'edit', 'own'),
  ('sales', 'invoice',    'view', 'sub'),
  ('sales', 'payment',    'view', 'own'),
  ('sales', 'payment',    'add',  'own'),
  ('sales', 'product',    'view', 'any'),

  -- Accounting: full control of invoicing and collection.
  ('accounting', 'customer',   'view', 'any'),
  ('accounting', 'invoice',    'view', 'any'),
  ('accounting', 'invoice',    'add',  'any'),
  ('accounting', 'invoice',    'edit', 'any'),
  ('accounting', 'payment',    'view', 'any'),
  ('accounting', 'payment',    'add',  'any'),
  ('accounting', 'payment',    'edit', 'any'),
  ('accounting', 'sale_order', 'view', 'any'),
  ('accounting', 'product',    'view', 'any'),

  -- Warehouse & Logistics: the catalogue and what has to ship.
  ('warehouse', 'product',    'view', 'any'),
  ('warehouse', 'product',    'edit', 'any'),
  ('warehouse', 'sale_order', 'view', 'any'),
  ('warehouse', 'customer',   'view', 'sub'),
  ('warehouse', 'settings',   'view', 'any'),

  -- HR: employee records only.
  ('hr', 'user', 'view', 'any'),
  ('hr', 'user', 'add',  'any'),
  ('hr', 'user', 'edit', 'any')
) as p(role_key, module_key, action, scope)
join public.roles r on r.key = p.role_key;
