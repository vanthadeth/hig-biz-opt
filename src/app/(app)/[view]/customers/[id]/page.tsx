import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  addressLine,
  CONTACT_COLUMNS,
  CUSTOMERS_BUCKET,
  CUSTOMER_COLUMNS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_TONE,
  mapHref,
  PICTURE_COLUMNS,
  telegramHref,
  type Customer,
  type CustomerContact,
  type CustomerPicture,
} from "@/lib/customers";
import { formatDate } from "@/lib/users";
import { PictureManager } from "../PictureManager";
import { Receivables } from "../Receivables";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("shop_name")
    .eq("id", id)
    .maybeSingle();

  return { title: (data?.shop_name as string) ?? "Customer" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [record, contactsResult, picturesResult, directory, mine] = await Promise.all([
    supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("customer_contacts")
      .select(CONTACT_COLUMNS)
      .eq("customer_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order"),
    supabase
      .from("customer_pictures")
      .select(PICTURE_COLUMNS)
      .eq("customer_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order"),
    supabase
      .from("customer_directory")
      .select("province_name, district_name, commune_name, owner_name")
      .eq("id", id)
      .maybeSingle(),
    getMyPermissions(),
  ]);

  // Row level security already hid it; a missing row and a forbidden row look
  // the same from here, which is the right answer to give either way.
  if (!record.data) notFound();

  const customer = record.data as unknown as Customer;
  const contacts = (contactsResult.data ?? []) as unknown as CustomerContact[];
  const pictures = (picturesResult.data ?? []) as unknown as CustomerPicture[];

  // `can` answers "do you hold this at all". Whether it reaches *this* shop is
  // the policy's business, and a refused write says so with an empty result —
  // so the button is a courtesy and the policy is the rule.
  const canEdit = can(mine, "customer", "edit");
  const canDelete = can(mine, "customer", "delete");

  const where = addressLine({
    street_address: customer.street_address,
    commune_name: (directory.data?.commune_name as string) ?? null,
    district_name: (directory.data?.district_name as string) ?? null,
    province_name: (directory.data?.province_name as string) ?? null,
  });
  const map = mapHref(customer);
  const lead = pictures[0]?.photo_path ?? null;

  return (
    <div className="space-y-5">
      <Link
        href={`/${view}/customers`}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        All customers
      </Link>

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <StoredPhoto
            name={customer.shop_name}
            path={lead}
            bucket={CUSTOMERS_BUCKET}
            fallback={<Icon name="building" className="size-7" />}
            className="size-20 rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{customer.shop_name}</h1>
            {customer.business_type && (
              <p className="text-sm text-muted">{customer.business_type}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={CUSTOMER_STATUS_TONE[customer.status]}>
                {CUSTOMER_STATUS_LABELS[customer.status]}
              </Chip>
              {directory.data?.owner_name && (
                <Chip tone="brand">{directory.data.owner_name as string}</Chip>
              )}
            </div>
          </div>
        </div>

        {customer.status !== "active" && customer.status_note && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            {customer.status_note}
          </p>
        )}

        {canEdit && (
          <Link
            href={`/${view}/customers/${customer.id}/edit`}
            className="pressable mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
          >
            <Icon name="pencil" className="size-4" />
            Edit customer
          </Link>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader
          title="Contacts"
          caption={`${contacts.length} ${contacts.length === 1 ? "person" : "people"}`}
        />
        {contacts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nobody recorded at this shop yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {contacts.map((contact) => {
              const telegram = telegramHref(contact.telegram_id);
              return (
                <li key={contact.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{contact.name}</span>
                      {contact.is_primary && <Chip tone="brand">Ring first</Chip>}
                    </span>
                    {contact.position && (
                      <span className="block truncate text-xs text-muted">
                        {contact.position}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone.replace(/\s/g, "")}`}
                        aria-label={`Call ${contact.name}`}
                        className="pressable flex size-9 items-center justify-center rounded-lg border border-line text-muted hover:text-fg"
                      >
                        <Icon name="phone" className="size-4" />
                      </a>
                    )}
                    {telegram && (
                      <a
                        href={telegram}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Telegram ${contact.name}`}
                        className="pressable flex size-9 items-center justify-center rounded-lg border border-line text-muted hover:text-fg"
                      >
                        <Icon name="send" className="size-4" />
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader title="Address" />
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Where" value={where} />
          <Row label="Landmark" value={customer.landmark} />
          <Row label="Postal code" value={customer.zipcode} />
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-xs text-muted">Location</dt>
            <dd className="min-w-0 flex-1">
              {map ? (
                <a
                  href={map}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  {customer.latitude}, {customer.longitude}
                </a>
              ) : (
                <span className="text-muted">Not pinned</span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <PictureManager customerId={customer.id} pictures={pictures} canEdit={canEdit} />

      <Receivables
        creditLimit={customer.credit_limit_usd}
        lastVisit={formatDate(customer.last_visit_date)}
        lastPurchase={formatDate(customer.last_purchase_date)}
      />

      {customer.remarks && (
        <Card className="p-4">
          <SectionHeader title="Remarks" />
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{customer.remarks}</p>
        </Card>
      )}

      {canDelete && (
        <p className="px-1 text-xs text-muted">
          Removing a customer takes its contacts and pictures with it. Setting the
          status to Inactive keeps the history.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}
