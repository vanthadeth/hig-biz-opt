import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Department, DirectoryEntry } from "@/lib/users";
import { UserList } from "./UserList";

const DEPARTMENTS: Department[] = [
  { id: "d1", name: "Sales", sort_order: 1 },
  { id: "d2", name: "Accounting", sort_order: 2 },
];

const PEOPLE: DirectoryEntry[] = [
  {
    id: "u1",
    full_name: "Sokha Chan",
    nickname: "Dara",
    position: "Sales Supervisor",
    department_id: "d1",
    status: "active",
    photo_path: null,
  },
  {
    id: "u2",
    full_name: "Bopha Lim",
    nickname: null,
    position: null,
    department_id: "d1",
    status: "suspended",
    photo_path: null,
  },
  {
    id: "u3",
    full_name: "Vichea Sok",
    nickname: null,
    position: "Accountant",
    department_id: "d2",
    status: "discharged",
    photo_path: null,
  },
];

function show(props: Partial<Parameters<typeof UserList>[0]> = {}) {
  return render(
    <UserList
      people={PEOPLE}
      departments={DEPARTMENTS}
      canAdd
      viewKey="admin"
      {...props}
    />,
  );
}

const search = () => screen.getByRole("searchbox", { name: "Search people" });

describe("UserList", () => {
  it("shows a department heading per group, in configured order", () => {
    show();

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Sales2", "Accounting1"]);
  });

  it("shows the name with its nickname, the position and the status", () => {
    show();

    const row = screen.getByRole("link", { name: /Sokha Chan/ });
    expect(within(row).getByText("Sokha Chan (Dara)")).toBeInTheDocument();
    expect(within(row).getByText("Sales Supervisor")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });

  it("says so rather than leaving a blank where a position would be", () => {
    const row = show().container.querySelector('a[href="/admin/users/u2"]')!;

    expect(within(row as HTMLElement).getByText("No position set")).toBeInTheDocument();
  });

  it("links each person to their record within the current view", () => {
    show({ viewKey: "sales" });

    expect(screen.getByRole("link", { name: /Sokha Chan/ })).toHaveAttribute(
      "href",
      "/sales/users/u1",
    );
  });

  it("filters as you type, and keeps the department heading", () => {
    show();

    fireEvent.change(search(), { target: { value: "accountant" } });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Accounting");
    expect(screen.queryByText("Sokha Chan (Dara)")).not.toBeInTheDocument();
  });

  it("finds someone by nickname", () => {
    // The reason nicknames are in the list at all: it is what people are called.
    show();

    fireEvent.change(search(), { target: { value: "dara" } });

    expect(screen.getByText("Sokha Chan (Dara)")).toBeInTheDocument();
    expect(screen.queryByText("Vichea Sok")).not.toBeInTheDocument();
  });

  it("names what it found nothing for", () => {
    show();

    fireEvent.change(search(), { target: { value: "zzz" } });

    expect(screen.getByRole("status")).toHaveTextContent("Nobody matches “zzz”.");
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("counts what is on screen", () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("3 people in 2 departments");

    fireEvent.change(search(), { target: { value: "sales" } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 person matching in 1 department",
    );
  });

  it("distinguishes an empty company from an empty search", () => {
    show({ people: [] });

    expect(screen.getByRole("status")).toHaveTextContent("Nobody here yet.");
  });

  it("offers Add new user to someone who may add one", () => {
    show();

    expect(screen.getByRole("link", { name: "Add new user" })).toHaveAttribute(
      "href",
      "/admin/users/new",
    );
  });

  it("hides it from someone who may not", () => {
    // A courtesy: the insert policy refuses it either way.
    show({ canAdd: false });

    expect(screen.queryByRole("link", { name: "Add new user" })).not.toBeInTheDocument();
  });
});
