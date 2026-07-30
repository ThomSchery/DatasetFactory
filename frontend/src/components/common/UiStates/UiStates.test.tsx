import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../Button";
import { Empty, FatalError, InlineError, Loading, Progress } from "./UiStates";

afterEach(cleanup);

describe("UiStates", () => {
  it("announces loading without escalating it to an alert", () => {
    render(<Loading label="Wczytywanie klatek" />);
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie klatek");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("labels the empty state and accepts the shared Button as its action", () => {
    render(
      <Empty
        action={<Button>Dodaj materiał</Button>}
        description="Zaimportuj pierwsze nagranie."
        title="Nie ma jeszcze materiałów"
      />,
    );

    expect(
      screen.getByRole("region", { name: "Nie ma jeszcze materiałów" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj materiał" })).toBeEnabled();
  });

  it("announces inline errors immediately", () => {
    render(<InlineError message="Plik nie istnieje." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Plik nie istnieje.");
  });

  it("keeps fatal error recovery keyboard accessible", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FatalError description="Sprawdź workspace." onRetry={onRetry} />);

    await user.tab();
    const retry = screen.getByRole("button", { name: "Spróbuj ponownie" });
    expect(retry).toHaveFocus();
    await user.keyboard(" ");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("clamps progress to a valid native progress range", () => {
    render(<Progress label="OCR" max={100} value={140} />);

    const progress = screen.getByRole("progressbar", { name: "OCR" });
    expect(progress).toHaveAttribute("max", "100");
    expect(progress).toHaveAttribute("value", "100");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
