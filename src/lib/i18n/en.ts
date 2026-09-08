/**
 * English, which is the shape.
 *
 * Every other language is typed against this object, so a key added here and
 * forgotten elsewhere is a compile error rather than something a rep finds in
 * a shop. It is also the fallback: a key with no Khmer yet shows these words
 * rather than a raw key or a blank.
 *
 * Keys are `area.thing`, and the value is the sentence as it appears — never a
 * fragment to be glued to another fragment, because word order differs between
 * the two languages and an assembled sentence can only be right in one.
 */
export const en = {
  // The shell -------------------------------------------------------------
  "nav.home": "Home",
  "nav.menu": "Menu",
  "nav.profile": "My profile",
  "nav.signOut": "Sign out",
  "nav.switchView": "Switch workspace",
  "nav.notifications": "Notifications",
  "nav.language": "Language",
  "nav.theme": "Appearance",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  // Quick actions ---------------------------------------------------------
  "quick.title": "Quick actions",
  "quick.also": "Also",
  "quick.none": "You do not have permission to create anything in {view}.",
  "quick.catalog": "Catalog",
  "quick.catalogHint": "Hand the phone over",
  "quick.newVisit": "New visit",
  "quick.newVisitHint": "Starts where you are",
  "quick.newCustomer": "New customer",
  "quick.newCustomerHint": "A shop not on the books",
  "quick.customerInfo": "Customer info",
  "quick.customerInfoHint": "The nearest shop",
  "quick.locking": "Locking…",

  // Visits ----------------------------------------------------------------
  "visit.new": "New visit",
  "visit.starting": "Starting…",
  "visit.startsHere": "Starts now, where you are. Choose the shop on the next screen.",
  "visit.findingYou": "Finding where you are…",
  "visit.allVisits": "All visits",
  "visit.open": "Open",
  "visit.checkedIn": "Checked in",
  "visit.checkedInAt": "Checked in {time}",
  "visit.ago": "{length} ago",
  "visit.soFar": "{length} so far",
  "visit.record": "Visit record",
  "visit.checkOut": "Check out",
  "visit.checkingOut": "Checking out…",
  "visit.checkOutAsk": "Check out?",
  "visit.checkOutBody":
    "This closes the visit to {shop}, {length} after checking in. The time it writes cannot be changed afterwards.",
  "visit.checkOutSaveFirst": " Anything you have typed will be saved first.",
  "visit.notYet": "Not yet",
  "visit.save": "Save",
  "visit.saved": "Saved",
  "visit.chooseShop": "Choose the shop",
  "visit.whichShop": "Which shop?",
  "visit.findShop": "Find a shop",
  "visit.noShopMatches": "No shop matches that.",
  "visit.noPin": "No pin",
  "visit.somewhereElse": "Somewhere else",
  "visit.shopRemoved": "Shop removed",
  "visit.cancel": "Cancel this visit",
  "visit.cancelAsk": "Cancel this visit?",
  "visit.cancelBody":
    "The visit stays on the record with its times and where it happened, marked cancelled, and counts towards no hours.",
  "visit.cancelWhy": "Why",
  "visit.cancelPlaceholder": "Tapped by mistake",
  "visit.cancelKeep": "Keep it",
  "visit.cancelDo": "Cancel the visit",
  "visit.cancelling": "Cancelling…",
  "visit.cancelled": "Cancelled",
  "visit.outOfRange": "Out of range",
  "visit.distanceUnknown": "Distance unknown",
  "visit.atTheShop": "At the shop",
  "visit.metresAway": "{n} m away",
  "visit.metres": "{n} m",
  "visit.km": "{n} km",
  "visit.kmAway": "{n} km away",
  "visit.noteNoShop": "This visit is not to a shop, so there is no distance to measure.",
  "visit.noteNoFix": "No location was recorded at check-in, so there is no distance.",
  "visit.noteNoPin": "The shop has no location saved yet.",
  "visit.noteNamedLater":
    "The shop was named after the check-in, so no distance was measured.",
  "visit.noteOutside": "Checked in {distance} from the shop, outside {radius} m.",
  "visit.noteOutsideUnknown":
    "Checked in {distance} from the shop, outside the allowed distance.",
  "visit.arrived": "Arrived",
  "visit.left": "Left",
  "visit.length": "Length",
  "visit.stillOpen": "Still open",
  "visit.editLeft": "{length} left to correct this.",
  "visit.frozen": "This visit closed more than a day ago. What it says is now the record.",
  "visit.frozenCancelled": "This visit was cancelled. What it says is now the record.",
  "visit.viewingWhose": "Viewing {name}'s visit",
  "visit.notYours": "This is not your visit. Only {name} can change it.",
  "visit.recent": "Recent visits",

  "visit.noteLeftOutside": "Checked out {distance} from the shop, outside {radius} m.",
  "visit.noteLeftOutsideUnknown": "Checked out {distance} from the shop.",
  "visit.away": "Away",
  "visit.restore": "Restore this visit",
  "visit.restoreAsk": "Restore this visit?",
  "visit.restoreBody":
    "It counts towards the day's hours again, exactly as it was recorded. The reason it was cancelled is removed.",
  "visit.restoreKeep": "Leave it cancelled",
  "visit.restoreDo": "Restore it",
  "visit.restoring": "Restoring…",
  "visit.cancelledBecause": "Cancelled — {reason}. It counts towards no hours.",
  "visit.cancelledPlain": "Cancelled. It counts towards no hours.",

  // The visit record's questions -----------------------------------------
  "visit.type": "Type of visit",
  "visit.status": "Visit status",
  "visit.orderStatus": "Order status",
  "visit.paymentStatus": "Payment status",
  "visit.nextAppointment": "Next appointment",
  "visit.remarks": "Remarks",
  "visit.remarksPlaceholder": "Anything the office should know",

  // The day, and reports --------------------------------------------------
  "day.today": "Today",
  "day.yesterday": "Yesterday",
  "day.working": "Working",
  "day.active": "Active",
  "day.visits": "Visits",
  "day.report": "Report",
  "day.map": "Map",
  "day.clockIn": "Clocked in",
  "day.clockOut": "Clocked out",
  "day.stillOut": "Still out",
  "day.soFar": "Today so far",
  "day.thisWeek": "This week",
  "day.ofTarget": "{done} of {target}",
  "day.targetMet": "Target met",
  "day.noQuota": "Nobody has set a target yet.",
  "day.nothingYet": "No visits recorded in the last fortnight.",

  "report.day": "Day",
  "report.week": "Week",
  "report.month": "Month",
  "report.employee": "Employee",
  "report.aDay": "A day",
  "report.daysWorked": "{count} days worked",
  "report.dayWorked": "1 day worked",
  "report.visitCount": "{count} visits",
  "report.visitCountOne": "1 visit",
  "report.neverCheckedOut": "Never checked out",
  "report.outNow": "Out now",
  "report.dayNeverClosed": "A day was never closed",
  "report.nothing": "No visits recorded in the last ninety days.",
  "report.nothingFor": "Nothing recorded for {name} in the last ninety days.",


  // Targets, on the settings screen -------------------------------------
  "quota.title": "Daily and weekly targets",
  "quota.caption": "An empty box is a figure nobody manages.",
  "quota.daily": "A day",
  "quota.weekly": "A week",
  "quota.visits": "Visits",
  "quota.workingHours": "Working hours",
  "quota.activeHours": "Active hours",
  "quota.activeMeaning":
    "Active hours are the time inside shops; working hours are the whole day, travelling included.",
  "quota.notManaged": "Not managed",
  "quota.setAction": "Set quota",
  "quota.forPerson": "Quota for {name}",
  "quota.personCaption":
    "Leave a box empty to follow the company figure, shown as its placeholder.",

  // Customers -------------------------------------------------------------
  "customer.all": "All customers",
  "customer.none": "No shops to look up yet.",
  "customer.noAddress": "No address recorded",
  "customer.pickOnMap": "Pick on the map",
  "customer.movePin": "Move the pin",
  "customer.whereIsShop": "Where is the shop?",
  "customer.useThisSpot": "Use this spot",
  "customer.dropAPin": "Tap the map to drop a pin, then drag it to nudge.",
  "customer.useMyLocation": "Use my location",
  "customer.findingYou": "Finding you…",

  // Everywhere ------------------------------------------------------------
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saved": "Saved",
  "common.search": "Search",
  "common.optional": "optional",
  "common.signIn": "Sign in",
  "common.somethingWrong": "Something went wrong.",
} as const;
