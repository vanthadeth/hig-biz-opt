"use client";

import { useState, type ReactNode } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const TABS = [
  { value: "contact", label: "Contact & Address" },
  { value: "gallery", label: "Gallery" },
  { value: "account", label: "Account & Status" },
];

/**
 * The record in three parts.
 *
 * A customer accumulated seven cards, which on a phone is a long scroll to
 * reach the balance and a longer one to reach the status buttons. These are the
 * three questions actually asked of a shop — where is it and who do I ring,
 * what does it look like, and what does it owe — so they are the three tabs.
 *
 * All three panels stay mounted and the inactive ones are hidden. The gallery
 * holds its own list of pictures as uploads land, and unmounting it on a tab
 * change would throw that away and show the server's older answer on the way
 * back.
 *
 * The panels are passed in as nodes rather than built here, so everything
 * inside them stays a server component and this file carries nothing but the
 * one piece of state that has to live in the browser.
 */
export function CustomerTabs({
  contact,
  gallery,
  account,
}: {
  contact: ReactNode;
  gallery: ReactNode;
  account: ReactNode;
}) {
  const [tab, setTab] = useState("contact");

  return (
    <div className="space-y-4">
      {/* Wrapping rather than scrolling. These are the record's navigation, not
          a filter row: three tabs at these labels overflow a phone, and a third
          one sitting off the edge behind a swipe is a third one nobody finds. A
          second line costs less than that. */}
      <SegmentedTabs segments={TABS} value={tab} onChange={setTab} className="flex-wrap" />

      <div
        role="tabpanel"
        aria-label="Contact and address"
        className={tab === "contact" ? "space-y-4" : "hidden"}
      >
        {contact}
      </div>

      <div
        role="tabpanel"
        aria-label="Gallery"
        className={tab === "gallery" ? "space-y-4" : "hidden"}
      >
        {gallery}
      </div>

      <div
        role="tabpanel"
        aria-label="Account and status"
        className={tab === "account" ? "space-y-4" : "hidden"}
      >
        {account}
      </div>
    </div>
  );
}
