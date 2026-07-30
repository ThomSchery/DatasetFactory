import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("uses safe defaults and explicit design-system classes", () => {
    render(<Button>Zapisz</Button>);

    const button = screen.getByRole("button", { name: "Zapisz" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("df-button--primary", "df-button--md");
  });

  it("is reachable and activatable from the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Uruchom</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Uruchom" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks interaction when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Usuń
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Usuń" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("announces loading and blocks duplicate activation", () => {
    render(
      <Button loading loadingLabel="Zapisywanie profilu">
        Zapisz profil
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Zapisywanie profilu" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-loading", "true");
  });
});
