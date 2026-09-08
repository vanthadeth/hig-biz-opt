-- Sale Manager: edit any customer, not just their own.
--
-- View has been 'any' since 0006 -- the manager could always see every shop.
-- Edit stayed 'own', which meant "access all customers" was true for looking
-- and false for touching: a manager asked to fix a shop's address or phone
-- could only do it if they happened to be the one who created that record.
-- This closes that gap the same way accounting and a sale supervisor already
-- reach customer_credit -- one scope, moved from 'own' to 'any', nothing else
-- about the module changed.
update public.role_permissions rp
   set scope = 'any'
  from public.roles r
 where rp.role_id = r.id
   and r.key = 'sales_manager'
   and rp.module_key = 'customer'
   and rp.action = 'edit';
