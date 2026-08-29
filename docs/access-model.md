# Access model

Three separate questions, answered by three separate mechanisms. Keeping them
apart is what lets a salesperson who also does collections hold two workspaces
without either one leaking data.

| Question | Answered by |
| --- | --- |
| Which workspaces may I enter? | **Views** |
| What may I do in a module? | **Permissions** (role + per-user override) |
| Which records does that cover? | **Scope** |

## Views

`public.views` holds the four workspaces. Entitlement resolves as:

```
role_views (defaults for my role)
  + user_views where effect = 'allow'     -- granted to me specifically
  - user_views where effect = 'deny'      -- withheld from me specifically
```

A super admin reaches every active view. An employee whose `status` is not
`active` reaches none, so a suspension or discharge takes effect immediately
without deleting anything.

`my_views()` returns the result. `my_nav(view)` returns that view's modules,
already filtered by the caller's `view` permission — a module in a view's
navigation set that the caller may not view simply does not appear.

## Permissions

A permission is a **module** × **action** pair held at a **scope**.

- Actions: `view`, `add`, `edit`, `delete`
- Scopes: `own`, `sub`, `any`

`role_permissions` carries the defaults for a role.
`user_permission_overrides` layers on one person, in both directions:
`effect = 'allow'` grants at a scope, `effect = 'deny'` revokes outright.

### Resolution order

`app.effective_scope(user, module, action)` returns the scope held, or null for
no access, in this order — the first match wins:

1. Employee is not `active` → **no access**
2. `is_super_admin` → **`any`**
3. A `deny` override for this module and action → **no access**
4. An `allow` override → **its scope**
5. The role's permission → **its scope**
6. Otherwise → **no access**

## Scope

`app.can(module, action, owner)` tests the scope against a record's owner:

| Scope | Covers |
| --- | --- |
| `own` | Records owned by or assigned to me |
| `sub` | Mine, plus everyone below me in the report-to chain (`manager_id`, followed recursively) |
| `any` | All records |

Called without an owner, `can` asks only whether the permission is held at all —
which is what a navigation entry or a "New" button needs to know.

## Where it is enforced

In the database. The functions above are `security definer` and are called
directly from the row-level security policies in `0006_rls.sql`, so the same
rule that hides a button also refuses the query. The frontend calls
`my_permissions()`, `my_views()` and `my_nav()` to render what is already true,
never to decide it.

Two columns are deliberately kept out of the shared directory view
(`public.user_directory`): `date_of_birth`, which the specification marks as not
shown publicly, and the three `bank_*` columns, which are payroll data. Callers
that legitimately need them read `public.users`, where RLS still applies.
