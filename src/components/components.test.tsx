// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResultCodeChip, StatusLabel } from "@/components/protocol/protocol-badges";
import { CapabilityMark } from "@/components/protocol/capability-mark";

describe("Field", () => {
  it("ties the label, hint and error to the control", () => {
    render(
      <Field label="Domain name" hint="Use the A-label form." error="Required">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Domain name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Use the A-label form. Required");
  });

  it("is valid without an error", () => {
    render(<Field label="Name">{(control) => <Input {...control} />}</Field>);
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-describedby");
  });
});

describe("Callout", () => {
  it("announces failures and leaves other messages to be read", () => {
    render(
      <>
        <Callout tone="danger" title="Not saved">
          The server refused it.
        </Callout>
        <Callout title="Heads up" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved");
    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
  });
});

describe("protocol badges", () => {
  it("shows the raw result code with its meaning", () => {
    render(<ResultCodeChip code="02303" />);
    expect(screen.getByText("02303")).toBeInTheDocument();
    expect(screen.getByText("Object does not exist")).toBeInTheDocument();
  });

  it("flags a malformed or empty result code", () => {
    render(
      <>
        <ResultCodeChip code="9" />
        <ResultCodeChip code="" />
      </>,
    );
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("no code")).toBeInTheDocument();
  });

  it("marks an unknown status label instead of replacing it", () => {
    render(
      <>
        <StatusLabel type="domainStatus" label="clientHold" />
        <StatusLabel type="domainStatus" label="quarantine" />
      </>,
    );
    expect(screen.getByText("clientHold").closest("span")).toHaveAttribute("title", expect.stringContaining("DNS delegation"));
    expect(screen.getByText("quarantine")).toBeInTheDocument();
    expect(screen.getByText("not defined by the draft")).toBeInTheDocument();
  });

  it("names the support state of a capability for assistive technology", () => {
    render(
      <>
        <CapabilityMark support="offered" />
        <CapabilityMark support="not-offered" />
        <CapabilityMark support="unknown" />
      </>,
    );
    expect(screen.getAllByRole("img").map((mark) => mark.getAttribute("aria-label"))).toEqual([
      "Offered by the server",
      "Not offered by the server",
      "Not confirmed: no server capabilities read yet",
    ]);
  });
});

describe("Button and Badge", () => {
  it("defaults to a non-submitting button and keeps the tone readable without colour", () => {
    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <Button>Save changes</Button>
        <Badge tone="danger" dot>
          Failed
        </Badge>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute("type", "button");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
