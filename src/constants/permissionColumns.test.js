import { cleanup, render, screen } from "@testing-library/react";
import { permissionColumns } from "./permissionColumns";

describe("permissionColumns", () => {
  afterEach(() => {
    cleanup();
  });

  test("has 38 permission columns", () => {
    expect(permissionColumns).toHaveLength(38);
  });

  test.each(permissionColumns)("renders true as a check for $field", (column) => {
    render(column.renderCell({ value: true }));

    expect(screen.getByTestId("CheckIcon")).toBeInTheDocument();
    expect(screen.queryByTestId("CloseIcon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("HelpOutlineIcon")).not.toBeInTheDocument();
  });

  test.each(permissionColumns)("renders false as a cross for $field", (column) => {
    render(column.renderCell({ value: false }));

    expect(screen.getByTestId("CloseIcon")).toBeInTheDocument();
    expect(screen.queryByTestId("CheckIcon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("HelpOutlineIcon")).not.toBeInTheDocument();
  });

  test.each(permissionColumns)("renders null as a failed lookup for $field", (column) => {
    render(column.renderCell({ value: null }));

    expect(screen.getByTestId("HelpOutlineIcon")).toBeInTheDocument();
    expect(screen.queryByTestId("CloseIcon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("CheckIcon")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Permission lookup failed")).toBeInTheDocument();
  });

  test.each(permissionColumns)("renders undefined as a failed lookup for $field", (column) => {
    render(column.renderCell({ value: undefined }));

    expect(screen.getByTestId("HelpOutlineIcon")).toBeInTheDocument();
    expect(screen.queryByTestId("CloseIcon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("CheckIcon")).not.toBeInTheDocument();
  });
});
